#!/usr/bin/env bun
/**
 * Initialize Agentarium for this project
 * Creates .agentarium folder with project metadata and database
 */

import { initializeProject, getProjectMetadata, isProjectInitialized } from "../lib/project";
import { getDatabase } from "../lib/database";

function main() {
  if (isProjectInitialized()) {
    const metadata = getProjectMetadata();
    console.log("Agentarium already initialized for this project.");
    console.log(`  Directory: .agentarium/`);
    console.log(`  Auto-open dashboard: ${metadata?.auto_open_dashboard ?? true}`);
    console.log(`  Dashboard port: ${metadata?.dashboard_port ?? 3847}`);
    return;
  }

  const result = initializeProject();

  if (result.success) {
    // Initialize the database schema
    getDatabase();

    const metadata = getProjectMetadata();
    console.log("Agentarium initialized successfully!");
    console.log(`  Directory: ${result.path}`);
    console.log(`  Auto-open dashboard: ${metadata?.auto_open_dashboard ?? true}`);
    console.log(`  Dashboard port: ${metadata?.dashboard_port ?? 3847}`);
    console.log("\nThe dashboard will auto-open when you start a new Claude Code session.");
  } else {
    console.error("Failed to initialize Agentarium:", result.message);
    process.exit(1);
  }
}

main();
