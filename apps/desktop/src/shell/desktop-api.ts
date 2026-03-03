import { BrowserWindow } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DesktopApiOptions {
  createWindow: (opts?: { path?: string; width?: number; height?: number; deferLoad?: boolean }) => BrowserWindow;
  getWebUrl: () => string;
  windowServerPortMap: Map<number, number>;
  startIsolatedServer: (dbPath: string) => Promise<{ port: number; close: () => Promise<void> }>;
}

interface RouteInstance {
  get(path: string, handler: () => Promise<unknown>): void;
  post(path: string, handler: (request: any, reply: any) => Promise<unknown>): void;
  delete(path: string, handler: (request: any, reply: any) => Promise<unknown>): void;
}

function buildWaitForScript(selector: string, timeoutMs: number): string {
  const selectorJson = JSON.stringify(selector);
  return `
    new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('wait_for timed out after ${timeoutMs}ms')),
        ${timeoutMs}
      );
      const check = () => {
        if (document.querySelector(${selectorJson})) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    })
  `;
}

export async function desktopApiPlugin(
  fastify: RouteInstance,
  opts: DesktopApiOptions,
) {
  fastify.get("/desktop/windows", async () => {
    const windows = BrowserWindow.getAllWindows();
    return windows.map((w) => ({
      id: w.id,
      title: w.getTitle(),
      url: w.webContents.getURL(),
    }));
  });

  fastify.post("/desktop/windows", async (request: any, reply: any) => {
    const { path, width, height, isolated } = (request.body as {
      path?: string;
      width?: number;
      height?: number;
      isolated?: boolean;
    }) || {};

    if (isolated) {
      const docsDbPath = join(homedir(), ".kombuse", "docs.db");
      // Create window WITHOUT loading URL yet — renderer must not fire server:port IPC
      // until the isolated port is in the map.
      const win = opts.createWindow({ path, width, height, deferLoad: true });

      let isolatedServer: { port: number; close: () => Promise<void> };
      try {
        isolatedServer = await opts.startIsolatedServer(docsDbPath);
      } catch (err) {
        win.close();
        return reply.status(500).send({ error: "Failed to start isolated server" });
      }

      // Map is set BEFORE loadURL — renderer's ipcRenderer.sendSync("server:port") will
      // now return the isolated port, not the primary port.
      const webContentsId = win.webContents.id;
      opts.windowServerPortMap.set(webContentsId, isolatedServer.port);
      win.on("closed", () => {
        void isolatedServer.close().catch(console.error);
        opts.windowServerPortMap.delete(webContentsId);
      });

      // Now it's safe to load the URL.
      const loadUrl = path ? new URL(path, opts.getWebUrl()).href : opts.getWebUrl();
      win.loadURL(loadUrl);

      await new Promise<void>((resolve) => {
        if (win.webContents.isLoading()) {
          win.webContents.once("did-finish-load", () => resolve());
        } else {
          resolve();
        }
      });

      return {
        id: win.id,
        title: win.getTitle(),
        url: win.webContents.getURL(),
      };
    }

    const win = opts.createWindow({ path, width, height });

    // Wait for the window to be ready before returning
    await new Promise<void>((resolve) => {
      if (win.webContents.isLoading()) {
        win.webContents.once("did-finish-load", () => resolve());
      } else {
        resolve();
      }
    });

    return {
      id: win.id,
      title: win.getTitle(),
      url: win.webContents.getURL(),
    };
  });

  fastify.post(
    "/desktop/windows/:id/navigate",
    async (request: any, reply: any) => {
      const id = Number(request.params.id);
      const { path, wait_for_selector, timeout_ms } = (request.body as {
        path: string;
        wait_for_selector?: string;
        timeout_ms?: number;
      }) || {};

      if (!path) {
        return reply.status(400).send({ error: "path is required" });
      }

      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }

      const url = `${opts.getWebUrl()}${path}`;
      await win.loadURL(url);

      if (wait_for_selector) {
        const safeTimeout = Math.max(0, Number(timeout_ms ?? 5000));
        await win.webContents.executeJavaScript(buildWaitForScript(wait_for_selector, safeTimeout));
      }

      return {
        id: win.id,
        url: win.webContents.getURL(),
      };
    },
  );

  fastify.post(
    "/desktop/windows/:id/execute-js",
    async (request: any, reply: any) => {
      const id = Number(request.params.id);
      const { script, timeout_ms } = (request.body as { script: string; timeout_ms?: number }) || {};

      if (!script) return reply.status(400).send({ error: 'script is required' });

      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }

      if (!opts.windowServerPortMap.has(win.webContents.id)) {
        return reply.status(403).send({ error: "execute_js is only allowed on isolated windows" });
      }

      const safeTimeout = Math.max(1000, Number(timeout_ms ?? 30000));
      let result: unknown;
      try {
        const executePromise = win.webContents.executeJavaScript(script);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`execute_js timed out after ${safeTimeout}ms`)), safeTimeout)
        );
        result = await Promise.race([executePromise, timeoutPromise]);
      } catch (error) {
        return reply.status(400).send({
          error: `Script execution failed: ${(error as Error).message}`,
        });
      }
      return { result };
    },
  );

  fastify.post(
    "/desktop/windows/:id/wait-for",
    async (request: any, reply: any) => {
      const id = Number(request.params.id);
      const { selector, timeout_ms } = (request.body as {
        selector: string;
        timeout_ms?: number;
      }) || {};

      if (!selector) return reply.status(400).send({ error: 'selector is required' });

      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }

      const safeTimeout = Math.max(0, Number(timeout_ms ?? 5000));
      try {
        await win.webContents.executeJavaScript(buildWaitForScript(selector, safeTimeout));
        return { found: true, selector };
      } catch (error) {
        return reply.status(408).send({
          error: `wait_for failed: ${(error as Error).message}`,
        });
      }
    },
  );

  fastify.post(
    "/desktop/windows/:id/screenshot",
    async (request: any, reply: any) => {
      const id = Number(request.params.id);

      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }

      const image = await win.webContents.capturePage();
      const png = image.toPNG();

      return {
        data: png.toString("base64"),
        mimeType: "image/png",
      };
    },
  );

  fastify.delete(
    "/desktop/windows/:id",
    async (request: any, reply: any) => {
      const id = Number(request.params.id);
      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }
      win.close();
      return { success: true };
    },
  );
}
