/**
 * Electron shell main process.
 *
 * The shell is stable and rarely updated. It loads the payload dynamically,
 * which contains the server and web assets that can be hot-swapped.
 *
 * Modes:
 * - dev: Web from Vite (localhost:3333), embedded server
 * - preview: Embedded server, local payload
 * - prod: Embedded server, installed payload with updater
 */

import { app, BrowserWindow } from "electron";
import { initializeDatabase, seedDatabase } from "@kombuse/persistence";
import { createServer as createServerDirect } from "server";
import { registerAppProtocol } from "./protocol";
import { getPayloadInfo, loadPayload } from "./payload-loader";
import { is, getMode } from "../env";

const SERVER_PORT = 3332;
const DEV_WEB_URL = "http://localhost:3333";

/**
 * Start embedded server in dev mode (direct import, no payload).
 */
async function startDevServer() {
  const db = initializeDatabase();
  seedDatabase(db);

  const server = await createServerDirect({ port: SERVER_PORT, db });
  await server.listen();

  console.log(`Dev server running on port ${SERVER_PORT}`);
  return { server };
}

/**
 * Start embedded server from payload (preview/prod mode).
 */
async function startPayloadServer() {
  const db = initializeDatabase();
  seedDatabase(db);

  const payload = getPayloadInfo();
  console.log(`Loading payload v${payload.manifest.version} from ${payload.path}`);

  const { createServer } = await loadPayload(payload.serverBundle);
  const server = await createServer({ port: SERVER_PORT, db });
  await server.listen();

  console.log(`Server running on port ${SERVER_PORT}`);
  return { server, payload };
}

let webUrl = DEV_WEB_URL;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(webUrl);
}

app.whenReady().then(async () => {
  const mode = getMode();
  console.log(`Starting in ${mode} mode`);

  try {
    if (is.dev()) {
      // Dev mode: embedded server, web from Vite
      await startDevServer();
      webUrl = DEV_WEB_URL;
    } else {
      // Preview/Prod: embedded server, payload-based web
      const { payload } = await startPayloadServer();
      registerAppProtocol(payload.webRoot);
      webUrl = "app://./";
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
