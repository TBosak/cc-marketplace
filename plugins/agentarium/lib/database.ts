import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = join(process.env.CLAUDE_PROJECT_ROOT || process.cwd(), ".agentarium", "agentarium.db");

function ensureDbDir() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  ensureDbDir();
  db = new Database(DB_PATH, { create: true });

  // Enable WAL mode for better concurrency (multiple hooks can access simultaneously)
  db.exec("PRAGMA journal_mode = WAL");
  // Wait up to 5 seconds if database is locked instead of failing immediately
  db.exec("PRAGMA busy_timeout = 5000");
  // Synchronous mode for durability
  db.exec("PRAGMA synchronous = NORMAL");

  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      project_root TEXT,
      working_directory TEXT,
      model TEXT,
      git_branch TEXT,
      total_cost REAL DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      metadata TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      parent_agent_id TEXT,
      agent_type TEXT,
      description TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT DEFAULT 'running',
      total_turns INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (parent_agent_id) REFERENCES agents(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_output TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      status TEXT DEFAULT 'pending',
      error TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event TEXT NOT NULL,
      matcher TEXT,
      script TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      description TEXT
    )
  `);

  // Create indexes for common queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_uses_agent ON tool_uses(agent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(git_branch)`);

  // Add git_branch column if it doesn't exist (migration for existing DBs)
  try {
    db.run(`ALTER TABLE sessions ADD COLUMN git_branch TEXT`);
  } catch {
    // Column already exists
  }
}

// Session operations
export function createSession(sessionId: string, data: {
  projectRoot?: string;
  workingDirectory?: string;
  model?: string;
  gitBranch?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDatabase();
  db.run(`
    INSERT OR REPLACE INTO sessions (id, started_at, project_root, working_directory, model, git_branch, metadata)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?)
  `, [
    sessionId,
    data.projectRoot || null,
    data.workingDirectory || null,
    data.model || null,
    data.gitBranch || null,
    data.metadata ? JSON.stringify(data.metadata) : null
  ]);
}

export function endSession(sessionId: string) {
  const db = getDatabase();
  db.run(`UPDATE sessions SET ended_at = datetime('now') WHERE id = ?`, [sessionId]);
}

export function deleteSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) return;
  const db = getDatabase();
  const placeholders = sessionIds.map(() => "?").join(",");
  // Delete related data first (foreign key constraints)
  db.run(`DELETE FROM tool_uses WHERE session_id IN (${placeholders})`, sessionIds);
  db.run(`DELETE FROM events WHERE session_id IN (${placeholders})`, sessionIds);
  db.run(`DELETE FROM agents WHERE session_id IN (${placeholders})`, sessionIds);
  db.run(`DELETE FROM sessions WHERE id IN (${placeholders})`, sessionIds);
}

export function getSessions(limit = 50, offset = 0, gitBranch?: string) {
  const db = getDatabase();
  if (gitBranch) {
    return db.query(`
      SELECT * FROM sessions
      WHERE git_branch = ?
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(gitBranch, limit, offset);
  }
  return db.query(`
    SELECT * FROM sessions
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function getGitBranches() {
  const db = getDatabase();
  return db.query(`
    SELECT DISTINCT git_branch FROM sessions
    WHERE git_branch IS NOT NULL
    ORDER BY git_branch
  `).all() as Array<{ git_branch: string }>;
}

// Agent operations
export function createAgent(data: {
  id: string;
  sessionId: string;
  parentAgentId?: string;
  agentType?: string;
  description?: string;
}) {
  const db = getDatabase();
  db.run(`
    INSERT INTO agents (id, session_id, parent_agent_id, agent_type, description, started_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `, [data.id, data.sessionId, data.parentAgentId || null, data.agentType || null, data.description || null]);
}

export function endAgent(agentId: string, status = 'completed') {
  const db = getDatabase();
  db.run(`UPDATE agents SET ended_at = datetime('now'), status = ? WHERE id = ?`, [status, agentId]);
}

export function getAgents(sessionId?: string, limit = 100) {
  const db = getDatabase();
  if (sessionId) {
    return db.query(`
      SELECT * FROM agents WHERE session_id = ? ORDER BY started_at DESC LIMIT ?
    `).all(sessionId, limit);
  }
  return db.query(`SELECT * FROM agents ORDER BY started_at DESC LIMIT ?`).all(limit);
}

// Tool use operations
export function recordToolStart(data: {
  sessionId: string;
  agentId?: string;
  toolName: string;
  toolInput?: unknown;
}) {
  const db = getDatabase();
  const result = db.run(`
    INSERT INTO tool_uses (session_id, agent_id, tool_name, tool_input, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [
    data.sessionId,
    data.agentId || null,
    data.toolName,
    data.toolInput ? JSON.stringify(data.toolInput) : null
  ]);
  return result.lastInsertRowid;
}

export function recordToolEnd(id: number, data: {
  output?: unknown;
  status: string;
  error?: string;
}) {
  const db = getDatabase();
  db.run(`
    UPDATE tool_uses
    SET ended_at = datetime('now'),
        duration_ms = (julianday(datetime('now')) - julianday(started_at)) * 86400000,
        tool_output = ?,
        status = ?,
        error = ?
    WHERE id = ?
  `, [
    data.output ? JSON.stringify(data.output) : null,
    data.status,
    data.error || null,
    id
  ]);
}

export function markPendingToolsInterrupted(sessionId: string) {
  const db = getDatabase();
  db.run(`
    UPDATE tool_uses
    SET ended_at = datetime('now'),
        duration_ms = (julianday(datetime('now')) - julianday(started_at)) * 86400000,
        status = 'interrupted',
        error = 'Session ended before tool completed'
    WHERE session_id = ? AND status = 'pending'
  `, [sessionId]);
}

export function cleanupStalePendingTools() {
  // Mark any pending tool uses from ended sessions as interrupted
  // This handles cases where session-end hook wasn't called (e.g., terminal killed)
  const db = getDatabase();
  db.run(`
    UPDATE tool_uses
    SET ended_at = datetime('now'),
        duration_ms = (julianday(datetime('now')) - julianday(started_at)) * 86400000,
        status = 'interrupted',
        error = 'Session ended abnormally'
    WHERE status = 'pending'
    AND session_id IN (
      SELECT id FROM sessions WHERE ended_at IS NOT NULL
    )
  `);
  // Also mark pending tools from sessions older than 1 hour as interrupted
  // (handles case where session never got an end event at all)
  db.run(`
    UPDATE tool_uses
    SET ended_at = datetime('now'),
        duration_ms = (julianday(datetime('now')) - julianday(started_at)) * 86400000,
        status = 'interrupted',
        error = 'Stale pending tool (session likely ended abnormally)'
    WHERE status = 'pending'
    AND started_at < datetime('now', '-1 hour')
  `);
}

export function getToolUses(filters: {
  sessionId?: string;
  agentId?: string;
  toolName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.sessionId) {
    conditions.push("session_id = ?");
    params.push(filters.sessionId);
  }
  if (filters.agentId) {
    conditions.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.toolName) {
    conditions.push("tool_name = ?");
    params.push(filters.toolName);
  }
  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit || 100, filters.offset || 0);

  return db.query(`
    SELECT * FROM tool_uses ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(...params);
}

// Event operations
export function recordEvent(data: {
  sessionId: string;
  agentId?: string;
  eventType: string;
  eventData?: unknown;
}) {
  const db = getDatabase();
  db.run(`
    INSERT INTO events (session_id, agent_id, event_type, event_data, timestamp)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [
    data.sessionId,
    data.agentId || null,
    data.eventType,
    data.eventData ? JSON.stringify(data.eventData) : null
  ]);
}

export function getEvents(filters: {
  sessionId?: string;
  agentId?: string;
  eventType?: string;
  limit?: number;
}) {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.sessionId) {
    conditions.push("session_id = ?");
    params.push(filters.sessionId);
  }
  if (filters.agentId) {
    conditions.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.eventType) {
    conditions.push("event_type = ?");
    params.push(filters.eventType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit || 100);

  return db.query(`
    SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ?
  `).all(...params);
}

// Analytics
export function getAnalytics(sessionId?: string) {
  const db = getDatabase();
  const sessionFilter = sessionId ? "WHERE session_id = ?" : "";
  const params = sessionId ? [sessionId] : [];

  const toolCounts = db.query(`
    SELECT tool_name, COUNT(*) as count, AVG(duration_ms) as avg_duration
    FROM tool_uses ${sessionFilter}
    GROUP BY tool_name
    ORDER BY count DESC
  `).all(...params);

  const statusCounts = db.query(`
    SELECT status, COUNT(*) as count
    FROM tool_uses ${sessionFilter}
    GROUP BY status
  `).all(...params);

  const agentCounts = db.query(`
    SELECT agent_type, COUNT(*) as count
    FROM agents ${sessionFilter}
    GROUP BY agent_type
  `).all(...params);

  const hourlyActivity = db.query(`
    SELECT strftime('%Y-%m-%d %H:00', started_at) as hour, COUNT(*) as count
    FROM tool_uses ${sessionFilter}
    GROUP BY hour
    ORDER BY hour DESC
    LIMIT 24
  `).all(...params);

  return {
    toolCounts,
    statusCounts,
    agentCounts,
    hourlyActivity
  };
}

// Hook management
export function saveHook(hook: {
  name: string;
  event: string;
  matcher?: string;
  script: string;
  description?: string;
}) {
  const db = getDatabase();
  db.run(`
    INSERT INTO hooks (name, event, matcher, script, description, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `, [hook.name, hook.event, hook.matcher || null, hook.script, hook.description || null]);
}

export function getHooks() {
  const db = getDatabase();
  return db.query(`SELECT * FROM hooks ORDER BY created_at DESC`).all();
}

export function toggleHook(id: number, enabled: boolean) {
  const db = getDatabase();
  db.run(`UPDATE hooks SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, id]);
}

export function deleteHook(id: number) {
  const db = getDatabase();
  db.run(`DELETE FROM hooks WHERE id = ?`, [id]);
}

// Timeline data
export function getTimeline(filters: {
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}) {
  const db = getDatabase();
  const toolConditions: string[] = [];
  const eventConditions: string[] = [];
  const filterParams: unknown[] = [];

  if (filters.sessionId) {
    toolConditions.push("session_id = ?");
    eventConditions.push("session_id = ?");
    filterParams.push(filters.sessionId);
  }
  if (filters.startTime) {
    toolConditions.push("started_at >= ?");
    eventConditions.push("timestamp >= ?");
    filterParams.push(filters.startTime);
  }
  if (filters.endTime) {
    toolConditions.push("started_at <= ?");
    eventConditions.push("timestamp <= ?");
    filterParams.push(filters.endTime);
  }

  const toolWhere = toolConditions.length > 0 ? `WHERE ${toolConditions.join(" AND ")}` : "";
  const eventWhere = eventConditions.length > 0 ? `WHERE ${eventConditions.join(" AND ")}` : "";

  // Parameters need to be provided twice: once for tool_uses WHERE, once for events WHERE
  const allParams = [...filterParams, ...filterParams, filters.limit || 200];

  // Combine tool uses and events into a unified timeline
  return db.query(`
    SELECT
      'tool' as type,
      id,
      session_id,
      agent_id,
      tool_name as name,
      started_at as timestamp,
      status,
      duration_ms,
      tool_input as data
    FROM tool_uses ${toolWhere}
    UNION ALL
    SELECT
      'event' as type,
      id,
      session_id,
      agent_id,
      event_type as name,
      timestamp,
      NULL as status,
      NULL as duration_ms,
      event_data as data
    FROM events ${eventWhere}
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(...allParams);
}
