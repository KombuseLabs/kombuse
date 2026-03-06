import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateCheckResult, UpdateStatus } from "@kombuse/types";
import {
  updateRoutes,
  setAutoUpdater,
  _resetAutoUpdater,
  type AutoUpdaterInterface,
} from "../routes/updates.routes";

vi.mock("../websocket/hub", () => ({
  wsHub: {
    broadcastToTopic: vi.fn(),
  },
}));

import { wsHub } from "../websocket/hub";

const mockStatus: UpdateStatus = {
  state: "idle",
  currentVersion: "1.0.0",
  updateInfo: null,
  downloadProgress: 0,
  error: null,
};

const mockCheckResult: UpdateCheckResult = {
  hasUpdate: true,
  updateInfo: {
    version: "2.0.0",
    downloadUrl: "https://example.com/update",
    releaseNotes: "New features",
    publishedAt: "2026-03-06T00:00:00Z",
  },
  currentVersion: "1.0.0",
};

function createMockUpdater(): AutoUpdaterInterface {
  return {
    getStatus: vi.fn(() => mockStatus),
    checkForUpdates: vi.fn(async () => mockCheckResult),
    downloadAndInstall: vi.fn(async () => {}),
    onStatusChange: vi.fn(() => () => {}),
  };
}

describe("updateRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    _resetAutoUpdater();
    vi.clearAllMocks();
    app = Fastify();
    await app.register(updateRoutes, { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("when updater not configured", () => {
    it("GET /updates/status returns 503", async () => {
      const response = await app.inject({ method: "GET", url: "/api/updates/status" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Updates not available" });
    });

    it("POST /updates/check returns 503", async () => {
      const response = await app.inject({ method: "POST", url: "/api/updates/check" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Updates not available" });
    });

    it("POST /updates/install returns 503", async () => {
      const response = await app.inject({ method: "POST", url: "/api/updates/install" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Updates not available" });
    });
  });

  describe("when updater configured", () => {
    let mockUpdater: AutoUpdaterInterface;

    beforeEach(() => {
      mockUpdater = createMockUpdater();
      setAutoUpdater(mockUpdater);
    });

    it("GET /updates/status delegates to getStatus()", async () => {
      const response = await app.inject({ method: "GET", url: "/api/updates/status" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockStatus);
      expect(mockUpdater.getStatus).toHaveBeenCalledOnce();
    });

    it("POST /updates/check delegates to checkForUpdates()", async () => {
      const response = await app.inject({ method: "POST", url: "/api/updates/check" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockCheckResult);
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("POST /updates/check with force=true calls clearCache() when present", async () => {
      const clearCache = vi.fn();
      const updaterWithCache = { ...createMockUpdater(), clearCache };
      _resetAutoUpdater();
      setAutoUpdater(updaterWithCache);

      const response = await app.inject({
        method: "POST",
        url: "/api/updates/check",
        payload: { force: true },
      });

      expect(response.statusCode).toBe(200);
      expect(clearCache).toHaveBeenCalledOnce();
      expect(updaterWithCache.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("POST /updates/check with force=true skips clearCache() when absent", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/updates/check",
        payload: { force: true },
      });

      expect(response.statusCode).toBe(200);
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("POST /updates/install delegates to downloadAndInstall()", async () => {
      const response = await app.inject({ method: "POST", url: "/api/updates/install" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(mockUpdater.downloadAndInstall).toHaveBeenCalledOnce();
    });
  });

  describe("error handling", () => {
    it("POST /updates/check returns 500 when checkForUpdates throws", async () => {
      const mockUpdater = createMockUpdater();
      (mockUpdater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      setAutoUpdater(mockUpdater);

      const response = await app.inject({ method: "POST", url: "/api/updates/check" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "boom" });
    });

    it("POST /updates/install returns 500 when downloadAndInstall throws", async () => {
      const mockUpdater = createMockUpdater();
      (mockUpdater.downloadAndInstall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      setAutoUpdater(mockUpdater);

      const response = await app.inject({ method: "POST", url: "/api/updates/install" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "boom" });
    });
  });

  describe("setAutoUpdater broadcast wiring", () => {
    it("forwards status changes to wsHub.broadcastToTopic", () => {
      const mockUpdater = createMockUpdater();
      setAutoUpdater(mockUpdater);

      const onStatusChangeCall = (mockUpdater.onStatusChange as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const listener = onStatusChangeCall[0] as (status: UpdateStatus) => void;

      const newStatus: UpdateStatus = { ...mockStatus, state: "available" };
      listener(newStatus);

      expect(wsHub.broadcastToTopic).toHaveBeenCalledWith("updates", {
        type: "update:status",
        status: newStatus,
      });
    });
  });
});
