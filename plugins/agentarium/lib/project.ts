// Project metadata management for agentarium
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const AGENTARIUM_DIR = join(PROJECT_ROOT, ".agentarium");
const PROJECT_FILE = join(AGENTARIUM_DIR, "project.json");
const SETTINGS_FILE = join(PROJECT_ROOT, ".claude", "settings.local.json");
const AGENTARIUM_ROOT = process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(import.meta.path));

export interface ProjectMetadata {
  initialized: boolean;
  created_at: string;
  auto_open_dashboard: boolean;
  dashboard_port: number;
  needs_restart?: boolean;  // True on first init, cleared after hooks work
}

const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  initialized: true,
  created_at: new Date().toISOString(),
  auto_open_dashboard: true,
  dashboard_port: 3847,
  needs_restart: true,  // Set to true on first init
};

export function getAgentariumDir(): string {
  return AGENTARIUM_DIR;
}

export function isProjectInitialized(): boolean {
  return existsSync(PROJECT_FILE);
}

export function getProjectMetadata(): ProjectMetadata | null {
  if (!existsSync(PROJECT_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(PROJECT_FILE, "utf-8"));
  } catch {
    // Corrupted file
    return null;
  }
}

export function saveProjectMetadata(metadata: ProjectMetadata): void {
  if (!existsSync(AGENTARIUM_DIR)) {
    mkdirSync(AGENTARIUM_DIR, { recursive: true });
  }
  writeFileSync(PROJECT_FILE, JSON.stringify(metadata, null, 2));
}

export function initializeProject(): { success: boolean; message: string; path: string } {
  if (isProjectInitialized()) {
    return {
      success: true,
      message: "Project already initialized",
      path: AGENTARIUM_DIR,
    };
  }

  // Create .agentarium directory
  if (!existsSync(AGENTARIUM_DIR)) {
    mkdirSync(AGENTARIUM_DIR, { recursive: true });
  }

  // Create project.json with defaults
  const metadata: ProjectMetadata = {
    ...DEFAULT_PROJECT_METADATA,
    created_at: new Date().toISOString(),
  };
  saveProjectMetadata(metadata);

  return {
    success: true,
    message: "Project initialized successfully",
    path: AGENTARIUM_DIR,
  };
}

export function updateProjectMetadata(updates: Partial<ProjectMetadata>): ProjectMetadata | null {
  const metadata = getProjectMetadata();
  if (!metadata) {
    return null;
  }
  const updated = { ...metadata, ...updates };
  saveProjectMetadata(updated);
  return updated;
}

export function clearNeedsRestart(): void {
  const metadata = getProjectMetadata();
  if (metadata?.needs_restart) {
    saveProjectMetadata({ ...metadata, needs_restart: false });
  }
}

// Hook management types and functions
interface HookEntry {
  type: "command";
  command: string;
}

interface HookDefinition {
  matcher?: { tools?: string[] };
  hooks: HookEntry[];
}

type HookEventType = "SessionStart" | "SessionEnd" | "PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop";

type HooksConfig = {
  [K in HookEventType]?: HookDefinition[];
};

interface SettingsJson {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

function readSettings(): SettingsJson {
  if (existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeSettings(settings: SettingsJson): void {
  const dir = dirname(SETTINGS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

function getTrackingHooks(): HooksConfig {
  return {
    SessionStart: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/session-start.ts"` }] }
    ],
    SessionEnd: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/session-end.ts"` }] }
    ],
    PreToolUse: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/pre-tool.ts"` }] }
    ],
    PostToolUse: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/post-tool.ts"` }] }
    ],
    Stop: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/stop.ts"` }] }
    ],
    SubagentStop: [
      { hooks: [{ type: "command", command: `bun "${AGENTARIUM_ROOT}/hooks/subagent-stop.ts"` }] }
    ]
  };
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

export function areHooksInstalled(): boolean {
  const settings = readSettings();
  return settings.hooks ? hasAgentariumHooks(settings.hooks) : false;
}

export function installHooks(): { success: boolean; message: string } {
  const settings = readSettings();
  const trackingHooks = getTrackingHooks();

  // Remove any existing Agentarium hooks first
  const cleanedHooks = settings.hooks ? removeAgentariumHooksFromConfig(settings.hooks) : {};

  // Merge with tracking hooks
  settings.hooks = mergeHooks(cleanedHooks, trackingHooks);
  writeSettings(settings);

  return {
    success: true,
    message: `Installed Agentarium tracking hooks for ${Object.keys(trackingHooks).length} events`
  };
}
