#!/usr/bin/env bun
import { endAgent, recordEvent } from "../lib/database";
import { getContext, updateContext } from "../lib/context";

// Read hook input from stdin
const input = await Bun.stdin.text();
let hookData: {
  agent_id?: string;
  result?: unknown;
} | null = null;

try {
  hookData = JSON.parse(input);
} catch {
  // No input or invalid JSON
}

const ctx = getContext();

if (ctx.currentSessionId && ctx.agentStack.length > 0) {
  // Pop the completed agent from stack
  const completedAgentId = ctx.agentStack.pop()!;

  endAgent(completedAgentId, 'completed');

  recordEvent({
    sessionId: ctx.currentSessionId,
    agentId: completedAgentId,
    eventType: "agent_complete",
    eventData: {
      result: hookData?.result,
      timestamp: new Date().toISOString()
    }
  });

  // Set current agent to parent (or null if stack empty)
  updateContext({
    currentAgentId: ctx.agentStack.length > 0 ? ctx.agentStack[ctx.agentStack.length - 1] : null,
    agentStack: ctx.agentStack
  });
}

console.log(JSON.stringify({ continue: true }));
