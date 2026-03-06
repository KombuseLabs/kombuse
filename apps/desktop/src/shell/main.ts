/**
 * Electron shell main process.
 *
 * The shell is stable and rarely updated. It loads the package dynamically,
 * which contains the server and web assets that can be hot-swapped.
 *
 * Modes:
 * - dev: Web from Vite (localhost:3333), embedded server
 * - preview: Embedded server, local package
 * - prod: Embedded server, installed package with updater
 */

// Load .env before other imports
import { config } from "dotenv";
config();

// Fix PATH for macOS GUI-launched apps (before any PATH-dependent code)
import { fixMacOsPath } from "./fix-path";
fixMacOsPath();

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import * as Sentry from "@sentry/electron";

Sentry.init({
  dsn: "https://5812d23da71018e134e320af2e175115@o4510997023555584.ingest.us.sentry.io/4510997025193984",
});

// Register app:// as a privileged scheme so it gets localStorage, cookies, fetch, etc.
// Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ESM equivalent of __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer a colocated bridge script to avoid CWD/package-path drift.
const localBridgePath = join(__dirname, "mcp-bridge.mjs");
if (existsSync(localBridgePath)) {
  process.env.KOMBUSE_MCP_BRIDGE_PATH = localBridgePath;
}

import { createServer as createServerDirect, setAutoUpdater, setShellAutoUpdater } from "server";
import { registerAppProtocol } from "./protocol";
import { getPackageInfo, loadPackage } from "./package-loader";
import { desktopApiPlugin } from "./desktop-api";
import { autoUpdater } from "./auto-updater";
import { ShellUpdater } from "./shell-updater";
import { buildAppMenu, refreshMenu } from "./menu";
import { is, getMode } from "../env";

const shellUpdater = new ShellUpdater();

const DEV_WEB_URL = "http://localhost:3333";

let serverPort = 0;
const PORT_FILE = join(homedir(), ".kombuse", "server-port");
const windowServerPortMap = new Map<number, number>();

// Holds the active createServer fn — updated to package's createServer in prod/preview mode.
type CreateServerFn = (opts: { port: number; dbPath?: string; desktop?: boolean; isolated?: boolean }) => Promise<{
  listen: () => Promise<string>;
  close: () => Promise<unknown>;
  instance: unknown;
}>;
let _createServerForIsolated: CreateServerFn = createServerDirect as unknown as CreateServerFn;

/**
 * Start embedded server in dev mode (direct import, no package).
 */
async function startDevServer() {
  // Wire up auto-updaters to server (available in dev for testing)
  setAutoUpdater(autoUpdater);
  setShellAutoUpdater(shellUpdater);

  const server = await createServerDirect({ port: Number(process.env.KOMBUSE_PORT || 0), desktop: true });
  server.instance.register(desktopApiPlugin, { prefix: "/api", createWindow, getWebUrl: () => webUrl, windowServerPortMap, startIsolatedServer } as any);
  const address = await server.listen();
  serverPort = new URL(address).port ? Number(new URL(address).port) : 0;

  writeFileSync(PORT_FILE, String(serverPort));
  console.log(`Dev server running on port ${serverPort}`);
  return { server };
}

/**
 * Start embedded server from package (preview/prod mode).
 */
async function startPackageServer() {
  const pkg = getPackageInfo();
  console.log(`Loading package v${pkg.manifest.version} from ${pkg.path}`);

  const { createServer, setAutoUpdater: setPackageAutoUpdater, setShellAutoUpdater: setPackageShellAutoUpdater } = await loadPackage(pkg.serverBundle);
  _createServerForIsolated = createServer;

  // Wire up auto-updaters to server
  setPackageAutoUpdater(autoUpdater);
  if (setPackageShellAutoUpdater) setPackageShellAutoUpdater(shellUpdater);

  const server = await createServer({ port: 0, desktop: true });
  server.instance.register(desktopApiPlugin, { prefix: "/api", createWindow, getWebUrl: () => webUrl, windowServerPortMap, startIsolatedServer } as any);
  const address = await server.listen();
  serverPort = new URL(address).port ? Number(new URL(address).port) : 0;

  writeFileSync(PORT_FILE, String(serverPort));
  console.log(`Server running on port ${serverPort}`);
  return { server, pkg };
}

/**
 * Start an isolated Fastify server backed by a separate database.
 * The server is assigned a random port (port: 0) and never writes to the port file.
 */
async function startIsolatedServer(dbPath: string): Promise<{ port: number; close: () => Promise<void> }> {
  const server = await _createServerForIsolated({ port: 0, dbPath, desktop: false, isolated: true });
  const address = await server.listen();
  const port = new URL(address).port ? Number(new URL(address).port) : 0;

  // Auto-install the kombuse-dev plugin so isolated windows show realistic plugin data.
  // Fire-and-forget: 201 = installed, 409 = already installed (docs.db persists), errors swallowed.
  fetch(`http://127.0.0.1:${port}/api/plugins/install-remote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: 'localhost' },
    body: JSON.stringify({
      name: 'kombuse-dev',
      project_id: '00000000-0000-4000-a000-000000000001',
    }),
  }).catch(() => {})

  return { port, close: async () => { await server.close(); } };
}

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

function isSafeExternalUrl(url: string): boolean {
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

let webUrl = DEV_WEB_URL;

function createWindow(opts?: { path?: string; width?: number; height?: number; deferLoad?: boolean }): BrowserWindow {
  const focused = BrowserWindow.getFocusedWindow();
  const bounds = focused?.getBounds();
  const x = bounds ? bounds.x + 20 : undefined;
  const y = bounds ? bounds.y + 20 : undefined;

  const mainWindow = new BrowserWindow({
    width: opts?.width ?? 1200,
    height: opts?.height ?? 800,
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
    backgroundColor: "#1A1A1A",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 12 },
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, "preload.cjs"),
    },
  });

  // Intercept in-page navigation to external URLs
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    const appOrigin = new URL(webUrl).origin;
    if (parsed.origin === appOrigin || parsed.protocol === "app:") {
      return;
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  // Intercept window.open() / target="_blank" links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("found-in-page", (_, result) => {
    mainWindow.webContents.send("find:result", {
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate,
    });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const loadUrl = opts?.path ? new URL(opts.path, webUrl).href : webUrl;
  if (!opts?.deferLoad) {
    mainWindow.loadURL(loadUrl);
  }

  return mainWindow;
}

// IPC handler for server port (used by renderer to discover API address)
// Returns isolated server port for isolated windows, primary port for all others.
ipcMain.on("server:port", (event) => {
  event.returnValue = windowServerPortMap.get(event.sender.id) ?? serverPort;
});

// IPC handler for home directory (used by redactPaths in preload)
ipcMain.on("app:homedir", (event) => {
  event.returnValue = app.getPath("home");
});

// IPC handler for app restart (used by auto-updater UI)
ipcMain.handle("app:restart", () => {
  console.log("[Main] Restart requested, relaunching app...");
  // In production (packaged app), relaunch works correctly.
  // In development, the app will quit and needs manual restart.
  app.relaunch();
  app.quit();
});

// IPC handler for shell update quit-and-install
ipcMain.handle("shell:update:quit-and-install", () => {
  console.log("[Main] Shell update: quit and install requested");
  shellUpdater.quitAndInstall();
});

// Find in page IPC handlers
ipcMain.handle("find:find", (event, text: string) => {
  event.sender.findInPage(text);
});

ipcMain.handle("find:next", (event, text: string) => {
  event.sender.findInPage(text, { forward: true, findNext: true });
});

ipcMain.handle("find:prev", (event, text: string) => {
  event.sender.findInPage(text, { forward: false, findNext: true });
});

ipcMain.handle("find:stop", (event) => {
  event.sender.stopFindInPage("clearSelection");
});

// IPC handler for opening a native directory picker
ipcMain.handle("dialog:openDirectory", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const result = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, {
        properties: ["openDirectory", "createDirectory"],
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

app.whenReady().then(async () => {
  const mode = getMode();
  console.log(`Starting in ${mode} mode`);

  // Set dock icon in dev mode (packaged builds use icon.icns from build-resources)
  if (is.dev() && process.platform === "darwin") {
    const iconPath = join(__dirname, "..", "..", "build-resources", "icon.png");
    app.dock?.setIcon(iconPath);
  }

  try {
    if (is.dev()) {
      // Dev mode: embedded server, web from Vite
      await startDevServer();
      webUrl = DEV_WEB_URL;
    } else {
      // Preview/Prod: embedded server, package-based web
      const { pkg } = await startPackageServer();
      registerAppProtocol(pkg.webRoot);
      webUrl = "app://./";
    }

    buildAppMenu({
      createWindow,
      webUrl,
      serverPort,
      isDev: is.dev(),
    });
    refreshMenu();

    createWindow();

    app.on("browser-window-focus", () => {
      refreshMenu();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    // Auto-check for updates after startup (prod mode only)
    if (is.prod()) {
      setTimeout(() => {
        console.log("Checking for package updates...");
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("Package update check failed:", err);
        });
      }, 5000);

      // Shell auto-update: check every 24 hours, first check after 10s
      shellUpdater.startPeriodicChecks();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Kombuse failed to start", msg);
    app.quit();
  }
});

app.on("will-quit", () => {
  shellUpdater.stopPeriodicChecks();
  try { unlinkSync(PORT_FILE); } catch { /* already removed */ }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
