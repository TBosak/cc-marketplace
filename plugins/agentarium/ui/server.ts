#!/usr/bin/env bun
import { Hono } from "hono";
import { cors } from "hono/cors";
import { join, dirname } from "node:path";
import {
  getSessions,
  getGitBranches,
  getAgents,
  getToolUses,
  getEvents,
  getAnalytics,
  getTimeline,
  getHooks,
  deleteSessions
} from "../lib/database";
import { getProjectMetadata } from "../lib/project";

// Get absolute paths based on this script's location
const UI_DIR = dirname(import.meta.path);
const DIST_DIR = join(UI_DIR, "dist");

const app = new Hono();

// CORS for development
app.use("*", cors());

// API Routes
app.get("/api/sessions", (c) => {
  const limit = Number(c.req.query("limit")) || 50;
  const offset = Number(c.req.query("offset")) || 0;
  const gitBranch = c.req.query("git_branch");
  return c.json(getSessions(limit, offset, gitBranch));
});

app.delete("/api/sessions", async (c) => {
  const body = await c.req.json<{ ids: string[] }>();
  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: "ids array required" }, 400);
  }
  deleteSessions(body.ids);
  return c.json({ deleted: body.ids.length });
});

app.get("/api/branches", (c) => {
  return c.json(getGitBranches());
});

app.get("/api/agents", (c) => {
  const sessionId = c.req.query("session_id");
  const limit = Number(c.req.query("limit")) || 100;
  return c.json(getAgents(sessionId, limit));
});

app.get("/api/tool-uses", (c) => {
  return c.json(getToolUses({
    sessionId: c.req.query("session_id"),
    agentId: c.req.query("agent_id"),
    toolName: c.req.query("tool_name"),
    status: c.req.query("status"),
    limit: Number(c.req.query("limit")) || 100,
    offset: Number(c.req.query("offset")) || 0
  }));
});

app.get("/api/events", (c) => {
  return c.json(getEvents({
    sessionId: c.req.query("session_id"),
    agentId: c.req.query("agent_id"),
    eventType: c.req.query("event_type"),
    limit: Number(c.req.query("limit")) || 100
  }));
});

app.get("/api/analytics", (c) => {
  const sessionId = c.req.query("session_id");
  return c.json(getAnalytics(sessionId));
});

app.get("/api/timeline", (c) => {
  return c.json(getTimeline({
    sessionId: c.req.query("session_id"),
    startTime: c.req.query("start_time"),
    endTime: c.req.query("end_time"),
    limit: Number(c.req.query("limit")) || 200
  }));
});

app.get("/api/hooks", (c) => {
  return c.json(getHooks());
});

app.get("/api/project-status", (c) => {
  const metadata = getProjectMetadata();
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const projectName = projectRoot.split("/").pop() || projectRoot.split("\\").pop() || "Unknown";
  return c.json({
    initialized: !!metadata,
    needs_restart: metadata?.needs_restart ?? false,
    auto_open_dashboard: metadata?.auto_open_dashboard ?? true,
    dashboard_port: metadata?.dashboard_port ?? 3847,
    project_root: projectRoot,
    project_name: projectName
  });
});

app.get("/api/debug", (c) => {
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const dbPath = `${projectRoot}/.agentarium/agentarium.db`;
  const { existsSync } = require("node:fs");
  return c.json({
    CLAUDE_PROJECT_ROOT: process.env.CLAUDE_PROJECT_ROOT || "(not set)",
    cwd: process.cwd(),
    resolved_project_root: projectRoot,
    db_path: dbPath,
    db_exists: existsSync(dbPath),
    agentarium_dir_exists: existsSync(`${projectRoot}/.agentarium`)
  });
});

// Serve static files from dist directory using absolute path
app.use("/*", async (c, next) => {
  const path = c.req.path;
  const filePath = join(DIST_DIR, path === "/" ? "index.html" : path);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const ext = filePath.split(".").pop();
    const contentType = ext === "js" ? "application/javascript" :
                        ext === "css" ? "text/css" :
                        ext === "html" ? "text/html" :
                        "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": contentType } });
  }
  return next();
});

// Fallback to index.html for SPA routing
app.get("*", async (c) => {
  const indexPath = join(DIST_DIR, "index.html");
  const file = Bun.file(indexPath);
  if (await file.exists()) {
    return c.html(await file.text());
  }
  return c.text(`Dashboard not built. DIST_DIR: ${DIST_DIR}`, 404);
});

const port = Number(process.env.AGENTARIUM_PORT) || 3847;

console.log(`Agentarium dashboard running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch
};
