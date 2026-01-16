#!/usr/bin/env bun
import { recordToolStart, createAgent, recordEvent } from "../lib/database";
import { getContext, updateContext, generateId } from "../lib/context";

// Read hook input from stdin
const input = await Bun.stdin.text();
let hookData: {
  tool_name: string;
  tool_input: unknown;
} | null = null;

try {
  hookData = JSON.parse(input);
} catch {
  // No input or invalid JSON
}

const ctx = getContext();

if (!ctx.currentSessionId) {
  // No active session, skip tracking
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

const toolName = hookData?.tool_name || "unknown";
const toolInput = hookData?.tool_input;

// Check if this is a Task tool (subagent spawn)
if (toolName === "Task") {
  const agentId = generateId();
  const taskInput = toolInput as { subagent_type?: string; description?: string; prompt?: string } | null;

  createAgent({
    id: agentId,
    sessionId: ctx.currentSessionId,
    parentAgentId: ctx.currentAgentId || undefined,
    agentType: taskInput?.subagent_type || "unknown",
    description: taskInput?.description || taskInput?.prompt?.substring(0, 100)
  });

  // Push to agent stack
  ctx.agentStack.push(agentId);
  updateContext({
    currentAgentId: agentId,
    agentStack: ctx.agentStack
  });

  recordEvent({
    sessionId: ctx.currentSessionId,
    agentId,
    eventType: "agent_start",
    eventData: { toolInput }
  });
}

// Record tool use
const toolUseId = recordToolStart({
  sessionId: ctx.currentSessionId,
  agentId: ctx.currentAgentId || undefined,
  toolName,
  toolInput
});

updateContext({ pendingToolUseId: Number(toolUseId) });

console.log(JSON.stringify({ continue: true }));
