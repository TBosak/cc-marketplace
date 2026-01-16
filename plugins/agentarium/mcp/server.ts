#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  getDatabase,
  getSessions,
  getAgents,
  getToolUses,
  getEvents,
  getAnalytics,
  getTimeline,
  getHooks
} from "../lib/database";
import {
  initializeProject,
  isProjectInitialized,
  getProjectMetadata,
  updateProjectMetadata,
  getAgentariumDir,
  areHooksInstalled,
  installHooks
} from "../lib/project";
import { startDashboardDetached } from "../lib/dashboard";

// MCP Server implementation using stdio
interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// New hook format types
interface HookEntry {
  type: "command";
  command: string;
}

interface HookMatcher {
  tools?: string[];
}

interface HookDefinition {
  matcher?: HookMatcher;
  hooks: HookEntry[];
}

type HookEventType = "SessionStart" | "SessionEnd" | "PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "PreCompact" | "Notification";

type HooksConfig = {
  [K in HookEventType]?: HookDefinition[];
};

interface SettingsJson {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

const AGENTARIUM_ROOT = process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(import.meta.path));

// The tracking hooks that Agentarium installs (new format)
function getTrackingHooks(): HooksConfig {
  return {
    SessionStart: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/session-start.ts"` }]
      }
    ],
    SessionEnd: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/session-end.ts"` }]
      }
    ],
    PreToolUse: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/pre-tool.ts"` }]
      }
    ],
    PostToolUse: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/post-tool.ts"` }]
      }
    ],
    Stop: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/stop.ts"` }]
      }
    ],
    SubagentStop: [
      {
        hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/subagent-stop.ts"` }]
      }
    ]
  };
}

function getProjectSettingsPath(): string {
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  return join(projectRoot, ".claude", "settings.local.json");
}

function readProjectSettings(): SettingsJson {
  const path = getProjectSettingsPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeProjectSettings(settings: SettingsJson): void {
  const path = getProjectSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2));
}

function isAgentariumHookDefinition(def: HookDefinition): boolean {
  return def.hooks.some(h => h.command.includes("agentarium") || h.command.includes(AGENTARIUM_ROOT));
}

function hasAgentariumHooks(hooks: HooksConfig): boolean {
  for (const eventHooks of Object.values(hooks)) {
    if (eventHooks?.some(def => isAgentariumHookDefinition(def))) {
      return true;
    }
  }
  return false;
}

function removeAgentariumHooksFromConfig(hooks: HooksConfig): HooksConfig {
  const result: HooksConfig = {};
  for (const [event, definitions] of Object.entries(hooks) as [HookEventType, HookDefinition[]][]) {
    const filtered = definitions?.filter(def => !isAgentariumHookDefinition(def));
    if (filtered && filtered.length > 0) {
      result[event] = filtered;
    }
  }
  return result;
}

function mergeHooks(existing: HooksConfig, toAdd: HooksConfig): HooksConfig {
  const result: HooksConfig = { ...existing };
  for (const [event, definitions] of Object.entries(toAdd) as [HookEventType, HookDefinition[]][]) {
    if (!result[event]) {
      result[event] = [];
    }
    result[event] = [...(result[event] || []), ...definitions];
  }
  return result;
}

const TOOLS = [
  {
    name: "agentarium_install_tracking",
    description: "Install Agentarium tracking hooks into the current project's settings. This adds hooks for SessionStart, SessionEnd, PreToolUse, PostToolUse, Stop, and SubagentStop events.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "agentarium_uninstall_tracking",
    description: "Remove Agentarium tracking hooks from the current project's settings.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "agentarium_check_tracking",
    description: "Check if Agentarium tracking hooks are installed in the current project.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "agentarium_get_sessions",
    description: "Get a list of Claude Code sessions tracked by Agentarium",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of sessions to return", default: 50 },
        offset: { type: "number", description: "Number of sessions to skip", default: 0 }
      }
    }
  },
  {
    name: "agentarium_get_agents",
    description: "Get agents (including subagents) from tracked sessions",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Filter by session ID" },
        limit: { type: "number", default: 100 }
      }
    }
  },
  {
    name: "agentarium_get_tool_uses",
    description: "Get tool usage records with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Filter by session ID" },
        agent_id: { type: "string", description: "Filter by agent ID" },
        tool_name: { type: "string", description: "Filter by tool name" },
        status: { type: "string", enum: ["success", "error", "pending"], description: "Filter by status" },
        limit: { type: "number", default: 100 },
        offset: { type: "number", default: 0 }
      }
    }
  },
  {
    name: "agentarium_get_events",
    description: "Get tracked events (agent starts/stops, session events)",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        agent_id: { type: "string" },
        event_type: { type: "string" },
        limit: { type: "number", default: 100 }
      }
    }
  },
  {
    name: "agentarium_get_analytics",
    description: "Get analytics and statistics about agent activity",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Filter analytics to a specific session" }
      }
    }
  },
  {
    name: "agentarium_get_timeline",
    description: "Get a unified timeline of tool uses and events",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        start_time: { type: "string", description: "ISO datetime string" },
        end_time: { type: "string", description: "ISO datetime string" },
        limit: { type: "number", default: 200 }
      }
    }
  },
  {
    name: "agentarium_query_db",
    description: "Execute a custom SQL query against the Agentarium database (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "SQL SELECT query" }
      },
      required: ["query"]
    }
  },
  {
    name: "agentarium_initialize",
    description: "Initialize Agentarium for this project. Creates .agentarium folder with project metadata and database. When initialized, dashboard auto-opens on session start.",
    inputSchema: {
      type: "object",
      properties: {
        auto_open_dashboard: {
          type: "boolean",
          description: "Whether to auto-open dashboard on session start (default: true)",
          default: true
        },
        dashboard_port: {
          type: "number",
          description: "Port for the dashboard server (default: 3847)",
          default: 3847
        }
      }
    }
  },
  {
    name: "agentarium_get_project_status",
    description: "Check if the current project is initialized for Agentarium and get project metadata",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "agentarium_update_project_settings",
    description: "Update project settings for Agentarium (auto_open_dashboard, dashboard_port)",
    inputSchema: {
      type: "object",
      properties: {
        auto_open_dashboard: {
          type: "boolean",
          description: "Whether to auto-open dashboard on session start"
        },
        dashboard_port: {
          type: "number",
          description: "Port for the dashboard server"
        }
      }
    }
  }
];

function handleToolCall(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "agentarium_install_tracking": {
      const settings = readProjectSettings();
      const trackingHooks = getTrackingHooks();

      // Remove any existing Agentarium hooks first
      const cleanedHooks = settings.hooks ? removeAgentariumHooksFromConfig(settings.hooks) : {};

      // Merge with tracking hooks
      settings.hooks = mergeHooks(cleanedHooks, trackingHooks);
      writeProjectSettings(settings);

      const installedEvents = Object.keys(trackingHooks);
      return {
        success: true,
        message: `Installed Agentarium tracking hooks for ${installedEvents.length} events`,
        hooks_installed: installedEvents,
        settings_path: getProjectSettingsPath()
      };
    }

    case "agentarium_uninstall_tracking": {
      const settings = readProjectSettings();
      const hadHooks = settings.hooks ? hasAgentariumHooks(settings.hooks) : false;

      if (settings.hooks) {
        settings.hooks = removeAgentariumHooksFromConfig(settings.hooks);
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
      }

      writeProjectSettings(settings);

      return {
        success: true,
        message: hadHooks ? "Removed Agentarium tracking hooks" : "No Agentarium hooks found",
        removed: hadHooks
      };
    }

    case "agentarium_check_tracking": {
      const settings = readProjectSettings();
      const hooks = settings.hooks || {};
      const trackingHooks = getTrackingHooks();

      const expectedEvents = Object.keys(trackingHooks) as HookEventType[];
      const installedEvents: string[] = [];
      const missingEvents: string[] = [];

      for (const event of expectedEvents) {
        const eventHooks = hooks[event];
        if (eventHooks?.some(def => isAgentariumHookDefinition(def))) {
          installedEvents.push(event);
        } else {
          missingEvents.push(event);
        }
      }

      return {
        installed: installedEvents.length > 0,
        hooks_count: installedEvents.length,
        expected_count: expectedEvents.length,
        installed_events: installedEvents,
        missing_events: missingEvents,
        fully_configured: missingEvents.length === 0
      };
    }

    case "agentarium_get_sessions":
      return getSessions(args.limit as number, args.offset as number);

    case "agentarium_get_agents":
      return getAgents(args.session_id as string, args.limit as number);

    case "agentarium_get_tool_uses":
      return getToolUses({
        sessionId: args.session_id as string,
        agentId: args.agent_id as string,
        toolName: args.tool_name as string,
        status: args.status as string,
        limit: args.limit as number,
        offset: args.offset as number
      });

    case "agentarium_get_events":
      return getEvents({
        sessionId: args.session_id as string,
        agentId: args.agent_id as string,
        eventType: args.event_type as string,
        limit: args.limit as number
      });

    case "agentarium_get_analytics":
      return getAnalytics(args.session_id as string);

    case "agentarium_get_timeline":
      return getTimeline({
        sessionId: args.session_id as string,
        startTime: args.start_time as string,
        endTime: args.end_time as string,
        limit: args.limit as number
      });

    case "agentarium_add_custom_hook": {
      const settings = readProjectSettings();
      const event = args.event as HookEventType;
      const script = args.script as string;
      const toolMatcher = args.matcher as string | undefined;

      const newHookDef: HookDefinition = {
        hooks: [{ type: "command", command: script }]
      };
      if (toolMatcher) {
        newHookDef.matcher = { tools: [toolMatcher] };
      }

      if (!settings.hooks) {
        settings.hooks = {};
      }
      if (!settings.hooks[event]) {
        settings.hooks[event] = [];
      }
      settings.hooks[event]!.push(newHookDef);
      writeProjectSettings(settings);

      return {
        success: true,
        message: `Added ${event} hook`,
        hook: newHookDef,
        total_events: Object.keys(settings.hooks).length
      };
    }

    case "agentarium_list_project_hooks": {
      const settings = readProjectSettings();
      const hooks = settings.hooks || {};
      const result: Array<{event: string; command: string; matcher?: HookMatcher; is_agentarium: boolean}> = [];

      for (const [event, definitions] of Object.entries(hooks)) {
        for (const def of definitions || []) {
          for (const hook of def.hooks) {
            result.push({
              event,
              command: hook.command,
              matcher: def.matcher,
              is_agentarium: isAgentariumHookDefinition(def)
            });
          }
        }
      }

      return {
        hooks: result,
        total: result.length,
        agentarium_count: result.filter(h => h.is_agentarium).length
      };
    }

    case "agentarium_remove_hook": {
      const settings = readProjectSettings();
      const hooks = settings.hooks || {};
      const event = args.event as HookEventType | undefined;
      const index = args.index as number;

      if (!event) {
        throw new Error("Event type is required for removing hooks");
      }

      const eventHooks = hooks[event];
      if (!eventHooks || index < 0 || index >= eventHooks.length) {
        throw new Error(`Invalid hook index: ${index} for event ${event}`);
      }

      const removed = eventHooks.splice(index, 1)[0];
      if (eventHooks.length === 0) {
        delete hooks[event];
      }

      if (Object.keys(hooks).length === 0) {
        delete settings.hooks;
      } else {
        settings.hooks = hooks;
      }

      writeProjectSettings(settings);

      return {
        success: true,
        removed: removed,
        event: event
      };
    }

    case "agentarium_query_db": {
      const query = (args.query as string).trim().toLowerCase();
      if (!query.startsWith("select")) {
        throw new Error("Only SELECT queries are allowed");
      }
      const db = getDatabase();
      return db.query(args.query as string).all();
    }

    case "agentarium_initialize": {
      const result = initializeProject();

      // Update settings if provided
      if (result.success && (args.auto_open_dashboard !== undefined || args.dashboard_port !== undefined)) {
        const updates: Record<string, unknown> = {};
        if (args.auto_open_dashboard !== undefined) {
          updates.auto_open_dashboard = args.auto_open_dashboard;
        }
        if (args.dashboard_port !== undefined) {
          updates.dashboard_port = args.dashboard_port;
        }
        updateProjectMetadata(updates);
      }

      // Initialize the database by calling getDatabase (creates schema)
      if (result.success) {
        getDatabase();
      }

      return {
        ...result,
        metadata: getProjectMetadata()
      };
    }

    case "agentarium_get_project_status": {
      const initialized = isProjectInitialized();
      const metadata = getProjectMetadata();
      return {
        initialized,
        agentarium_dir: getAgentariumDir(),
        metadata
      };
    }

    case "agentarium_update_project_settings": {
      if (!isProjectInitialized()) {
        throw new Error("Project not initialized. Run agentarium_initialize first.");
      }

      const updates: Record<string, unknown> = {};
      if (args.auto_open_dashboard !== undefined) {
        updates.auto_open_dashboard = args.auto_open_dashboard;
      }
      if (args.dashboard_port !== undefined) {
        updates.dashboard_port = args.dashboard_port;
      }

      const updated = updateProjectMetadata(updates);
      return {
        success: true,
        message: "Project settings updated",
        metadata: updated
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP Protocol handlers
function handleRequest(request: MCPRequest): MCPResponse {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize": {
        // Auto-initialize project and hooks on MCP server startup
        try {
          const wasInitialized = isProjectInitialized();
          if (!wasInitialized) {
            initializeProject();
            getDatabase(); // Initialize database schema
          }
          if (!areHooksInstalled()) {
            installHooks();
          }

          // Open dashboard using nohup to fully detach from this process
          const metadata = getProjectMetadata();
          if (metadata?.auto_open_dashboard) {
            const serverPath = join(AGENTARIUM_ROOT, "ui", "server.ts");
            const port = metadata.dashboard_port || 3847;
            const url = `http://localhost:${port}`;

            // Detect platform and WSL
            const platform = process.platform;
            const isWSL = platform === "linux" && (
              process.env.WSL_DISTRO_NAME ||
              process.env.WSLENV ||
              existsSync("/proc/sys/fs/binfmt_misc/WSLInterop")
            );

            // Determine browser open command
            let openCmd: string;
            if (platform === "darwin") {
              openCmd = "open";
            } else if (platform === "win32") {
              openCmd = "start";
            } else if (isWSL) {
              // WSL: use cmd.exe to open in Windows browser
              openCmd = "cmd.exe /c start";
            } else {
              openCmd = "xdg-open";
            }

            // Single shell command: start server in background, wait, open browser
            // Export CLAUDE_PROJECT_ROOT explicitly so the server knows where the database is
            const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
            const shellCmd = platform === "win32"
              ? `start /b bun "${serverPath}" && timeout /t 2 && start ${url}`
              : `export CLAUDE_PROJECT_ROOT="${projectRoot}" && export AGENTARIUM_PORT="${port}" && nohup bun "${serverPath}" > /dev/null 2>&1 & sleep 2 && ${openCmd} "${url}" > /dev/null 2>&1 &`;

            Bun.spawn(["sh", "-c", shellCmd], {
              cwd: AGENTARIUM_ROOT,
              stdio: ["ignore", "ignore", "ignore"],
              env: { ...process.env, AGENTARIUM_PORT: String(port), CLAUDE_PROJECT_ROOT: projectRoot }
            });
          }
        } catch {
          // Ignore initialization errors - don't block MCP startup
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "agentarium",
              version: "1.0.0"
            },
            capabilities: {
              tools: {}
            }
          }
        };
      }

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS }
        };

      case "tools/call": {
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = handleToolCall(name, args || {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };
      }

      case "notifications/initialized":
        // No response needed for notifications
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error"
      }
    };
  }
}

// Main loop - read from stdin, write to stdout
async function main() {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = handleRequest(request);

        if (response.result !== undefined || response.error !== undefined) {
          console.log(JSON.stringify(response));
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }
}

main().catch(console.error);
