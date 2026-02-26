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
   * Open a native directory picker.
   */
  selectDirectory: () => ipcRenderer.invoke("dialog:openDirectory") as Promise<string | null>,

  /**
   * The port the embedded server is listening on (resolved at preload time).
   */
  serverPort: ipcRenderer.sendSync("server:port") as number,

  /**
   * The platform the app is running on ('darwin', 'win32', 'linux').
   */
  platform: process.platform,

  /**
   * Shell (Electron binary) update controls.
   */
  shellUpdate: {
    quitAndInstall: () => ipcRenderer.invoke("shell:update:quit-and-install"),
  },

  /**
   * Listen for "Check for Updates" triggered from the app menu.
   */
  onCheckForUpdates: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("app:check-for-updates", handler);
    return () => { ipcRenderer.removeListener("app:check-for-updates", handler); };
  },

  /**
   * Find in page controls (Cmd+F / Ctrl+F).
   */
  findInPage: {
    find: (text: string) => ipcRenderer.invoke("find:find", text),
    findNext: (text: string) => ipcRenderer.invoke("find:next", text),
    findPrev: (text: string) => ipcRenderer.invoke("find:prev", text),
    stop: () => ipcRenderer.invoke("find:stop"),
    onToggle: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("find:toggle", handler);
      return () => { ipcRenderer.removeListener("find:toggle", handler); };
    },
    onResult: (callback: (result: { activeMatchOrdinal: number; matches: number; finalUpdate: boolean }) => void) => {
      const handler = (_: unknown, result: { activeMatchOrdinal: number; matches: number; finalUpdate: boolean }) => callback(result);
      ipcRenderer.on("find:result", handler);
      return () => { ipcRenderer.removeListener("find:result", handler); };
    },
  },
});
