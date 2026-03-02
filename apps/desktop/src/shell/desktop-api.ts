import { BrowserWindow } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DesktopApiOptions {
  createWindow: (opts?: { path?: string; width?: number; height?: number }) => BrowserWindow;
  getWebUrl: () => string;
  windowServerPortMap: Map<number, number>;
  startIsolatedServer: (dbPath: string) => Promise<{ port: number; close: () => Promise<void> }>;
}

interface RouteInstance {
  get(path: string, handler: () => Promise<unknown>): void;
  post(path: string, handler: (request: any, reply: any) => Promise<unknown>): void;
  delete(path: string, handler: (request: any, reply: any) => Promise<unknown>): void;
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

  fastify.post("/desktop/windows", async (request: any) => {
    const { path, width, height, isolated } = (request.body as {
      path?: string;
      width?: number;
      height?: number;
      isolated?: boolean;
    }) || {};
    const win = opts.createWindow({ path, width, height });

    if (isolated) {
      const docsDbPath = join(homedir(), ".kombuse", "docs.db");
      const isolatedServer = await opts.startIsolatedServer(docsDbPath);
      opts.windowServerPortMap.set(win.webContents.id, isolatedServer.port);
      win.on("closed", () => {
        isolatedServer.close();
        opts.windowServerPortMap.delete(win.webContents.id);
      });
    }

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
      const { path } = (request.body as { path: string }) || {};

      if (!path) {
        return reply.status(400).send({ error: "path is required" });
      }

      const win = BrowserWindow.fromId(id);
      if (!win) {
        return reply.status(404).send({ error: "Window not found" });
      }

      const url = `${opts.getWebUrl()}${path}`;
      await win.loadURL(url);

      return {
        id: win.id,
        url: win.webContents.getURL(),
      };
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
