import type { FastifyInstance } from "fastify";
import type { AutoUpdaterInterface } from "./updates";
import { wsHub } from "../websocket/hub";

let shellAutoUpdater: AutoUpdaterInterface | null = null;

/**
 * Set the shell auto-updater instance. Called from the desktop shell.
 * When set, status changes are automatically broadcast via WebSocket.
 */
export function setShellAutoUpdater(updater: AutoUpdaterInterface): void {
  shellAutoUpdater = updater;

  // Forward status changes to WebSocket
  shellAutoUpdater.onStatusChange((status) => {
    wsHub.broadcastToTopic("shell-updates", {
      type: "shell-update:status",
      status,
    });
  });
}

/**
 * API routes for the shell auto-updater.
 * Returns 503 if no shell auto-updater is configured (e.g., web-only deployment).
 */
export async function shellUpdateRoutes(fastify: FastifyInstance) {
  fastify.get("/shell-updates/status", async (_request, reply) => {
    if (!shellAutoUpdater) {
      return reply.status(503).send({ error: "Shell updates not available" });
    }
    return shellAutoUpdater.getStatus();
  });

  fastify.post("/shell-updates/check", async (_request, reply) => {
    if (!shellAutoUpdater) {
      return reply.status(503).send({ error: "Shell updates not available" });
    }

    try {
      const result = await shellAutoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Check failed",
      });
    }
  });

  fastify.post("/shell-updates/install", async (_request, reply) => {
    if (!shellAutoUpdater) {
      return reply.status(503).send({ error: "Shell updates not available" });
    }

    try {
      await shellAutoUpdater.downloadAndInstall();
      return { success: true };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Install failed",
      });
    }
  });
}
