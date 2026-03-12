/**
 * Preload script for the Electron renderer process.
 * DO NOT USE NODE MODULES HERE - this runs in a context without Node integration for security.
 * Exposes a minimal API surface to the renderer via contextBridge.
 * Only the restart function is exposed for security - all other
 * communication goes through HTTP/WebSocket to the embedded server.
 */

import { contextBridge, ipcRenderer } from "electron";
import { createBrowserLogger } from "@kombuse/core/browser-logger";

const logger = createBrowserLogger("Preload");

try {
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
     * Whether the macOS PATH fix succeeded at startup (true = ok, false = failed).
     */
    pathFixSucceeded: ipcRenderer.sendSync("app:path-fix-status") as boolean,

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
} catch (err) {
  logger.error("Failed to expose electron bridge", { error: err instanceof Error ? err.message : String(err) });
  // Expose minimal fallback so window.electron is always defined.
  // serverPort: 0 signals failure — the renderer falls back to the URL ?port= param.
  contextBridge.exposeInMainWorld("electron", { serverPort: 0, platform: process.platform, pathFixSucceeded: true });
}

// Wrapped in try/catch so a failure in __kombuse helpers never prevents
// the critical window.electron bridge above from being exposed.
let HOME_DIR = "";
try {
HOME_DIR = ipcRenderer.sendSync("app:homedir") as string;
contextBridge.exposeInMainWorld("__kombuse", {
  setInputValue: (selector: string, value: string): boolean => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  },

  activateTab: (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    return true;
  },

  openSelect: (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
    return true;
  },

  toggleCheckbox: (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const clientX = rect.x + rect.width / 2;
    const clientY = rect.y + rect.height / 2;
    const opts = { bubbles: true, clientX, clientY } as const;
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    return true;
  },

  scrollTo: (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.scrollIntoView({ behavior: "instant", block: "start" });
    return true;
  },

  getElementRect: (selector: string): { x: number; y: number; width: number; height: number } | null => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return null;
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  },

  redactPaths: (): number => {
    let count = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.includes(HOME_DIR)) {
        node.textContent = node.textContent.replaceAll(HOME_DIR, "/Users/demo");
        count++;
      }
    }
    return count;
  },
});
} catch (err) {
  logger.error("Failed to expose __kombuse helpers", { error: err instanceof Error ? err.message : String(err) });
}
