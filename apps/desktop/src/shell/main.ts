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

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

// ESM equivalent of __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer a colocated bridge script to avoid CWD/package-path drift.
const localBridgePath = join(__dirname, "mcp-bridge.mjs");
if (existsSync(localBridgePath)) {
  process.env.KOMBUSE_MCP_BRIDGE_PATH = localBridgePath;
}

import { initializeDatabase, seedDatabase } from "@kombuse/persistence";
import { createServer as createServerDirect, setAutoUpdater } from "server";
import { registerAppProtocol } from "./protocol";
import { getPackageInfo, loadPackage } from "./package-loader";
import { autoUpdater } from "./auto-updater";
import { buildAppMenu, refreshMenu } from "./menu";
import { is, getMode } from "../env";

const DEV_WEB_URL = "http://localhost:3333";

let serverPort = 0;
const PORT_FILE = join(homedir(), ".kombuse", "server-port");

/**
 * Start embedded server in dev mode (direct import, no package).
 */
async function startDevServer() {
  const db = initializeDatabase();
  seedDatabase(db);

  // Wire up auto-updater to server (available in dev for testing)
  setAutoUpdater(autoUpdater);

  const server = await createServerDirect({ port: 0, db });
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
  const db = initializeDatabase();
  seedDatabase(db);

  const pkg = getPackageInfo();
  console.log(`Loading package v${pkg.manifest.version} from ${pkg.path}`);

  const { createServer, setAutoUpdater: setPackageAutoUpdater } = await loadPackage(pkg.serverBundle);

  // Wire up auto-updater to server
  setPackageAutoUpdater(autoUpdater);

  const server = await createServer({ port: 0, db });
  const address = await server.listen();
  serverPort = new URL(address).port ? Number(new URL(address).port) : 0;

  writeFileSync(PORT_FILE, String(serverPort));
  console.log(`Server running on port ${serverPort}`);
  return { server, pkg };
}

let webUrl = DEV_WEB_URL;

function createWindow(path?: string): void {
  const focused = BrowserWindow.getFocusedWindow();
  const bounds = focused?.getBounds();
  const x = bounds ? bounds.x + 20 : undefined;
  const y = bounds ? bounds.y + 20 : undefined;

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
    backgroundColor: "#1A1A1A",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 12 },
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const url = path ? `${webUrl}${path}` : webUrl;
  mainWindow.loadURL(url);
}

// IPC handler for server port (used by renderer to discover API address)
ipcMain.on("server:port", (event) => {
  event.returnValue = serverPort;
});

// IPC handler for app restart (used by auto-updater UI)
ipcMain.handle("app:restart", () => {
  console.log("[Main] Restart requested, relaunching app...");
  // In production (packaged app), relaunch works correctly.
  // In development, the app will quit and needs manual restart.
  app.relaunch();
  app.quit();
});

// IPC handler for opening a native directory picker
ipcMain.handle("dialog:openDirectory", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const result = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, {
        properties: ["openDirectory"],
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory"],
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
        console.log("Checking for updates...");
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("Update check failed:", err);
        });
      }, 5000);
    }
  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }
});

app.on("will-quit", () => {
  try { unlinkSync(PORT_FILE); } catch { /* already removed */ }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
