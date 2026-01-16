#!/usr/bin/env bun
import { recordEvent } from "../lib/database";
import { getContext } from "../lib/context";

// Read hook input from stdin
const input = await Bun.stdin.text();
let hookData: {
  stop_reason?: string;
} | null = null;

try {
  hookData = JSON.parse(input);
} catch {
  // No input or invalid JSON
}

const ctx = getContext();

if (ctx.currentSessionId) {
  recordEvent({
    sessionId: ctx.currentSessionId,
    agentId: ctx.currentAgentId || undefined,
    eventType: "turn_complete",
    eventData: {
      stopReason: hookData?.stop_reason,
      timestamp: new Date().toISOString()
    }
  });
}

console.log(JSON.stringify({ continue: true }));
