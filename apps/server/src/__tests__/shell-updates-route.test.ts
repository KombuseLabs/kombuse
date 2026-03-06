import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateCheckResult, UpdateStatus } from "@kombuse/types";
import type { AutoUpdaterInterface } from "../routes/updates.routes";
import { shellUpdateRoutes, setShellAutoUpdater, _resetShellAutoUpdater } from "../routes/shell-updates.routes";

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

describe("shellUpdateRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    _resetShellAutoUpdater();
    vi.clearAllMocks();
    app = Fastify();
    await app.register(shellUpdateRoutes, { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("when updater not configured", () => {
    it("GET /shell-updates/status returns 503", async () => {
      const response = await app.inject({ method: "GET", url: "/api/shell-updates/status" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Shell updates not available" });
    });

    it("POST /shell-updates/check returns 503", async () => {
      const response = await app.inject({ method: "POST", url: "/api/shell-updates/check" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Shell updates not available" });
    });

    it("POST /shell-updates/install returns 503", async () => {
      const response = await app.inject({ method: "POST", url: "/api/shell-updates/install" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Shell updates not available" });
    });
  });

  describe("when updater configured", () => {
    let mockUpdater: AutoUpdaterInterface;

    beforeEach(() => {
      mockUpdater = createMockUpdater();
      setShellAutoUpdater(mockUpdater);
    });

    it("GET /shell-updates/status delegates to getStatus()", async () => {
      const response = await app.inject({ method: "GET", url: "/api/shell-updates/status" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockStatus);
      expect(mockUpdater.getStatus).toHaveBeenCalledOnce();
    });

    it("POST /shell-updates/check delegates to checkForUpdates()", async () => {
      const response = await app.inject({ method: "POST", url: "/api/shell-updates/check" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockCheckResult);
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("POST /shell-updates/install delegates to downloadAndInstall()", async () => {
      const response = await app.inject({ method: "POST", url: "/api/shell-updates/install" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(mockUpdater.downloadAndInstall).toHaveBeenCalledOnce();
    });
  });

  describe("error handling", () => {
    it("POST /shell-updates/check returns 500 when checkForUpdates throws", async () => {
      const mockUpdater = createMockUpdater();
      (mockUpdater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      setShellAutoUpdater(mockUpdater);

      const response = await app.inject({ method: "POST", url: "/api/shell-updates/check" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "boom" });
    });

    it("POST /shell-updates/install returns 500 when downloadAndInstall throws", async () => {
      const mockUpdater = createMockUpdater();
      (mockUpdater.downloadAndInstall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      setShellAutoUpdater(mockUpdater);

      const response = await app.inject({ method: "POST", url: "/api/shell-updates/install" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "boom" });
    });
  });

  describe("setShellAutoUpdater broadcast wiring", () => {
    it("forwards status changes to wsHub.broadcastToTopic", () => {
      const mockUpdater = createMockUpdater();
      setShellAutoUpdater(mockUpdater);

      const onStatusChangeCall = (mockUpdater.onStatusChange as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const listener = onStatusChangeCall[0] as (status: UpdateStatus) => void;

      const newStatus: UpdateStatus = { ...mockStatus, state: "available" };
      listener(newStatus);

      expect(wsHub.broadcastToTopic).toHaveBeenCalledWith("shell-updates", {
        type: "shell-update:status",
        status: newStatus,
      });
    });
  });
});
