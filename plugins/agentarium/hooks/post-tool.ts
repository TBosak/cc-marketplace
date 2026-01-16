#!/usr/bin/env bun
import { recordToolEnd } from "../lib/database";
import { getContext, updateContext } from "../lib/context";

// Read hook input from stdin
const input = await Bun.stdin.text();
let hookData: {
  tool_name: string;
  tool_output: unknown;
  error?: string;
} | null = null;

try {
  hookData = JSON.parse(input);
} catch {
  // No input or invalid JSON
}

const ctx = getContext();

if (ctx.pendingToolUseId) {
  const hasError = hookData?.error || (typeof hookData?.tool_output === 'string' && hookData.tool_output.includes('error'));

  recordToolEnd(ctx.pendingToolUseId, {
    output: hookData?.tool_output,
    status: hasError ? 'error' : 'success',
    error: hookData?.error
  });

  updateContext({ pendingToolUseId: null });
}

console.log(JSON.stringify({ continue: true }));
