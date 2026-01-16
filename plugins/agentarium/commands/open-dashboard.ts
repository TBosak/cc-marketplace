#!/usr/bin/env bun
/**
 * Open Agentarium Dashboard
 * Starts the dashboard server and opens it in the browser
 */

import { startDashboard } from "../lib/dashboard";
import { getProjectMetadata } from "../lib/project";

async function main() {
  // Get port from project metadata if available
  const metadata = getProjectMetadata();
  const port = metadata?.dashboard_port || Number(process.env.AGENTARIUM_PORT) || 3847;

  const result = await startDashboard({
    port,
    detached: false,
    openBrowser: true,
  });

  console.log(`\nAgentarium dashboard: ${result.url}`);
  console.log("Press Ctrl+C to stop the server");

  // Handle shutdown for the foreground process
  if (result.process) {
    process.on("SIGINT", () => {
      result.process?.kill();
      process.exit(0);
    });
  }
}

main().catch(console.error);
