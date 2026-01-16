// Shared context management for hooks
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CONTEXT_FILE = join(process.env.CLAUDE_PROJECT_ROOT || process.cwd(), ".agentarium", "context.json");

function ensureContextDir() {
  const dir = dirname(CONTEXT_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export interface AgentariumContext {
  currentSessionId: string | null;
  currentAgentId: string | null;
  pendingToolUseId: number | null;
  agentStack: string[];
}

export function getContext(): AgentariumContext {
  if (existsSync(CONTEXT_FILE)) {
    try {
      return JSON.parse(readFileSync(CONTEXT_FILE, "utf-8"));
    } catch {
      // Corrupted file, return default
    }
  }
  return {
    currentSessionId: null,
    currentAgentId: null,
    pendingToolUseId: null,
    agentStack: []
  };
}

export function saveContext(ctx: AgentariumContext) {
  ensureContextDir();
  writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2));
}

export function updateContext(updates: Partial<AgentariumContext>) {
  const ctx = getContext();
  Object.assign(ctx, updates);
  saveContext(ctx);
  return ctx;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
