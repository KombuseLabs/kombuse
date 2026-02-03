import { app, BrowserWindow } from "electron";
import { createServer } from "server";
import { initializeDatabase, seedDatabase } from "@kombuse/persistence";

const WEB_URL = "http://localhost:3333";
const SERVER_PORT = 3332;

async function startServer() {
  const db = initializeDatabase();
  seedDatabase(db);
  const server = await createServer({ port: SERVER_PORT, db });
  await server.listen();
  console.log(`Server running on port ${SERVER_PORT}`);
  return server;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(WEB_URL);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
