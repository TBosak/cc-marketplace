// Shared dashboard spawning logic for agentarium
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dir, "..");

// Detect if running in WSL
function isWSL(): boolean {
  return process.platform === "linux" && (
    !!process.env.WSL_DISTRO_NAME ||
    !!process.env.WSLENV ||
    existsSync("/proc/sys/fs/binfmt_misc/WSLInterop")
  );
}
const DEFAULT_PORT = 3847;

export interface DashboardOptions {
  port?: number;
  detached?: boolean;
  openBrowser?: boolean;
}

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "localhost" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(false); // Port is in use
    });
    socket.on("error", () => {
      resolve(true); // Port is available
    });
    // Add timeout
    setTimeout(() => {
      socket.destroy();
      resolve(true); // Assume available on timeout
    }, 500);
  });
}

/**
 * Open URL in default browser
 */
export function openBrowser(url: string): void {
  const platform = process.platform;

  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
  } else if (isWSL()) {
    // WSL: use cmd.exe to open in Windows browser
    spawn("cmd.exe", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

/**
 * Start the dashboard server
 * Returns the child process if started in foreground mode, or null if detached
 */
export async function startDashboard(options: DashboardOptions = {}): Promise<{
  success: boolean;
  url: string;
  message: string;
  process?: ChildProcess;
}> {
  const port = options.port || Number(process.env.AGENTARIUM_PORT) || DEFAULT_PORT;
  const url = `http://localhost:${port}`;

  // Check if dashboard is already running
  const portAvailable = await isPortAvailable(port);
  if (!portAvailable) {
    // Dashboard might already be running
    if (options.openBrowser) {
      openBrowser(url);
    }
    return {
      success: true,
      url,
      message: `Dashboard already running at ${url}`,
    };
  }

  // Spawn options - set cwd to plugin root for correct path resolution
  // Pass CLAUDE_PROJECT_ROOT so the server knows where the database is
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const spawnOptions: SpawnOptions = {
    cwd: PLUGIN_ROOT,
    env: { ...process.env, AGENTARIUM_PORT: String(port), CLAUDE_PROJECT_ROOT: projectRoot },
  };

  if (options.detached) {
    // Run detached for background operation (e.g., session start hook)
    spawnOptions.detached = true;
    spawnOptions.stdio = "ignore";
  } else {
    // Run in foreground for command usage
    spawnOptions.stdio = "inherit";
  }

  const serverPath = join(PLUGIN_ROOT, "ui", "server.ts");
  const serverProcess = spawn("bun", [serverPath], spawnOptions);

  if (options.detached) {
    // Unref to allow parent process to exit independently
    serverProcess.unref();
  }

  // Open browser after a short delay if requested
  if (options.openBrowser) {
    setTimeout(() => {
      openBrowser(url);
    }, 1000);
  }

  return {
    success: true,
    url,
    message: `Dashboard started at ${url}`,
    process: options.detached ? undefined : serverProcess,
  };
}

/**
 * Start dashboard in detached mode (for hooks/auto-open)
 */
export async function startDashboardDetached(port?: number): Promise<{
  success: boolean;
  url: string;
  message: string;
}> {
  return startDashboard({
    port,
    detached: true,
    openBrowser: true,
  });
}
