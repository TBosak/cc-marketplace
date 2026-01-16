#!/usr/bin/env bun
/**
 * Show Agentarium Statistics
 * Displays quick stats about agent activity in the terminal
 */

import { getAnalytics, getSessions, getAgents } from "../lib/database";

const sessions = getSessions(10) as Array<{
  id: string;
  started_at: string;
  ended_at: string | null;
}>;

const analytics = getAnalytics();

console.log("\n=== Agentarium Statistics ===\n");

// Sessions summary
console.log(`Sessions tracked: ${sessions.length}`);
if (sessions.length > 0) {
  const latest = sessions[0];
  console.log(`Latest session: ${latest.id.slice(0, 8)} (${new Date(latest.started_at).toLocaleString()})`);
}

// Tool usage
console.log("\n--- Tool Usage ---");
const toolCounts = analytics.toolCounts as Array<{ tool_name: string; count: number; avg_duration: number }>;
const totalTools = toolCounts.reduce((sum, t) => sum + t.count, 0);
console.log(`Total tool uses: ${totalTools}`);

if (toolCounts.length > 0) {
  console.log("\nTop 5 tools:");
  toolCounts.slice(0, 5).forEach((tool, i) => {
    console.log(`  ${i + 1}. ${tool.tool_name}: ${tool.count} uses (avg ${tool.avg_duration?.toFixed(0) || 0}ms)`);
  });
}

// Status breakdown
console.log("\n--- Status Breakdown ---");
const statusCounts = analytics.statusCounts as Array<{ status: string; count: number }>;
statusCounts.forEach((s) => {
  const pct = totalTools > 0 ? ((s.count / totalTools) * 100).toFixed(1) : "0";
  console.log(`  ${s.status}: ${s.count} (${pct}%)`);
});

// Agent types
console.log("\n--- Agent Types ---");
const agentCounts = analytics.agentCounts as Array<{ agent_type: string; count: number }>;
if (agentCounts.length > 0) {
  agentCounts.forEach((a) => {
    console.log(`  ${a.agent_type || "main"}: ${a.count}`);
  });
} else {
  console.log("  No agent data yet");
}

console.log("\n--- Dashboard ---");
console.log("Run /agentarium to open the full dashboard");
console.log("");
