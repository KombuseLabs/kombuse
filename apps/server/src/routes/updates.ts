import type { FastifyInstance } from "fastify";
import type { UpdateStatus, UpdateCheckResult } from "@kombuse/types";
import { wsHub } from "../websocket/hub";

/**
 * Interface for the auto-updater injected from the desktop shell.
 */
export interface AutoUpdaterInterface {
  getStatus(): UpdateStatus;
  checkForUpdates(): Promise<UpdateCheckResult>;
  downloadAndInstall(): Promise<void>;
  onStatusChange(listener: (status: UpdateStatus) => void): () => void;
}

let autoUpdater: AutoUpdaterInterface | null = null;

/**
 * Set the auto-updater instance. Called from the desktop shell.
 * When set, status changes are automatically broadcast via WebSocket.
 */
export function setAutoUpdater(updater: AutoUpdaterInterface): void {
  autoUpdater = updater;

  // Forward status changes to WebSocket
  autoUpdater.onStatusChange((status) => {
    wsHub.broadcastToTopic("updates", {
      type: "update:status",
      status,
    });
  });
}

/**
 * API routes for the auto-updater.
 * Returns 503 if no auto-updater is configured (e.g., web-only deployment).
 */
export async function updateRoutes(fastify: FastifyInstance) {
  // Get current update status
  fastify.get("/updates/status", async (_request, reply) => {
    if (!autoUpdater) {
      return reply.status(503).send({ error: "Updates not available" });
    }
    return autoUpdater.getStatus();
  });

  // Check for updates
  fastify.post("/updates/check", async (_request, reply) => {
    if (!autoUpdater) {
      return reply.status(503).send({ error: "Updates not available" });
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Check failed",
      });
    }
  });

  // Download and install update
  fastify.post("/updates/install", async (_request, reply) => {
    if (!autoUpdater) {
      return reply.status(503).send({ error: "Updates not available" });
    }

    try {
      await autoUpdater.downloadAndInstall();
      return { success: true };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Install failed",
      });
    }
  });
}
