/**
 * Preload script for the Electron renderer process.
 *
 * Exposes a minimal API surface to the renderer via contextBridge.
 * Only the restart function is exposed for security - all other
 * communication goes through HTTP/WebSocket to the embedded server.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  /**
   * Restart the application to apply updates.
   */
  restart: () => ipcRenderer.invoke("app:restart"),

  /**
   * The port the embedded server is listening on (resolved at preload time).
   */
  serverPort: ipcRenderer.sendSync("server:port") as number,
});
