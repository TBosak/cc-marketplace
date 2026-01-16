#!/usr/bin/env bun
import { endSession, recordEvent, markPendingToolsInterrupted } from "../lib/database";
import { getContext, updateContext } from "../lib/context";

const ctx = getContext();

if (ctx.currentSessionId) {
  // Mark any pending tool uses as interrupted before ending the session
  markPendingToolsInterrupted(ctx.currentSessionId);

  recordEvent({
    sessionId: ctx.currentSessionId,
    eventType: "session_end",
    eventData: { endedAt: new Date().toISOString() }
  });

  endSession(ctx.currentSessionId);
}

updateContext({
  currentSessionId: null,
  currentAgentId: null,
  pendingToolUseId: null,
  agentStack: []
});

console.log(JSON.stringify({ continue: true }));
