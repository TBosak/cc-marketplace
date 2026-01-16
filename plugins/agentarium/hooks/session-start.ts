#!/usr/bin/env bun
import { createSession, cleanupStalePendingTools } from "../lib/database";
import { updateContext, generateId } from "../lib/context";
import { isProjectInitialized, initializeProject, clearNeedsRestart } from "../lib/project";

// Clean up any stale pending tool uses from previous sessions
cleanupStalePendingTools();

const sessionId = generateId();

// Get current git branch
async function getGitBranch(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: process.env.CLAUDE_PROJECT_ROOT || process.cwd(),
      stdout: "pipe",
      stderr: "pipe"
    });
    const output = await new Response(proc.stdout).text();
    return output.trim() || null;
  } catch {
    return null;
  }
}

// Auto-initialize project if not initialized (MCP server should have done this already)
if (!isProjectInitialized()) {
  initializeProject();
}

const gitBranch = await getGitBranch();

createSession(sessionId, {
  projectRoot: process.env.CLAUDE_PROJECT_ROOT,
  workingDirectory: process.cwd(),
  model: process.env.CLAUDE_MODEL,
  gitBranch,
  metadata: {
    platform: process.platform,
    startedAt: new Date().toISOString()
  }
});

updateContext({
  currentSessionId: sessionId,
  currentAgentId: null,
  pendingToolUseId: null,
  agentStack: []
});

// Clear needs_restart flag since hooks are now working
clearNeedsRestart();

// Dashboard is opened by MCP server initialize handler, not here
// This avoids race conditions and duplicate browser windows

// Hook output - no blocking
console.log(JSON.stringify({ continue: true }));
