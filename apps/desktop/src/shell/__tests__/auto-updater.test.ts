/**
 * Unit tests for AutoUpdater (apps/desktop/src/shell/auto-updater.ts).
 *
 * Covers the full state machine: constructor, version initialization fallback
 * chain, update checking, download/install flow, cache clearing, and status
 * listener lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before AutoUpdater import
// ---------------------------------------------------------------------------

const {
  mockPackageManager,
  MockPackageManager,
  MockHttpFeed,
  mockInstallPackage,
  mockListPackages,
  mockGetPackageManifest,
  mockGetBundledPackagePath,
} = vi.hoisted(() => {
  const pm = {
    addFeed: vi.fn(),
    getFeeds: vi.fn(() => [] as unknown[]),
    checkForUpdates: vi.fn(),
    install: vi.fn(),
  };
  return {
    mockPackageManager: pm,
    MockPackageManager: vi.fn(() => pm),
    MockHttpFeed: vi.fn(),
    mockInstallPackage: vi.fn(() => "1.1.0"),
    mockListPackages: vi.fn(() => [] as unknown[]),
    mockGetPackageManifest: vi.fn(),
    mockGetBundledPackagePath: vi.fn(() => "/bundled"),
  };
});

vi.mock("@kombuse/pkg", () => ({
  PackageManager: MockPackageManager,
  HttpFeed: MockHttpFeed,
}));

vi.mock("../updater", () => ({
  installPackage: mockInstallPackage,
  listPackages: mockListPackages,
}));

vi.mock("../package-loader", () => ({
  getPackageManifest: mockGetPackageManifest,
  getBundledPackagePath: mockGetBundledPackagePath,
}));

import { AutoUpdater } from "../auto-updater";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_CHECK_RESULT_HAS_UPDATE = {
  hasUpdate: true,
  latest: {
    name: "kombuse/kombuse",
    version: "1.1.0",
    downloadUrl: "https://example.com/pkg.tar.gz",
    manifest: { name: "kombuse", version: "1.1.0", type: "app" as const, release_notes: "Bug fixes" },
    publishedAt: "2026-03-06T12:00:00Z",
  },
  currentVersion: "1.0.0",
};

const MOCK_CHECK_RESULT_NO_UPDATE = {
  hasUpdate: false,
  latest: null,
  currentVersion: "1.0.0",
};

const MOCK_INSTALL_RESULT = {
  version: "1.1.0",
  cachePath: "/cache/kombuse/1.1.0",
  manifest: { name: "kombuse", version: "1.1.0", type: "app" as const },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createUpdater(): AutoUpdater {
  return new AutoUpdater();
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Reset all mock state
  MockPackageManager.mockClear();
  MockHttpFeed.mockClear();
  mockPackageManager.addFeed.mockClear();
  mockPackageManager.getFeeds.mockReset().mockReturnValue([]);
  mockPackageManager.checkForUpdates.mockReset();
  mockPackageManager.install.mockReset();
  mockInstallPackage.mockReset().mockReturnValue("1.1.0");
  mockListPackages.mockReset().mockReturnValue([]);
  mockGetPackageManifest.mockReset();
  mockGetBundledPackagePath.mockReset().mockReturnValue("/bundled");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 1. Constructor
// ===========================================================================

describe("constructor", () => {
  it("creates PackageManager with no args", () => {
    createUpdater();
    expect(MockPackageManager).toHaveBeenCalledWith();
  });

  it("calls addFeed with HttpFeed constructed with baseUrl and cacheTtlMs", () => {
    createUpdater();
    expect(MockHttpFeed).toHaveBeenCalledWith({
      baseUrl: expect.any(String),
      cacheTtlMs: 300_000,
    });
    expect(mockPackageManager.addFeed).toHaveBeenCalledOnce();
  });

  it("starts in idle state with default values", () => {
    const updater = createUpdater();
    const status = updater.getStatus();
    expect(status.state).toBe("idle");
    expect(status.updateInfo).toBeNull();
    expect(status.downloadProgress).toBe(0);
    expect(status.error).toBeNull();
  });
});

// ===========================================================================
// 2. initCurrentVersion — fallback chain
// ===========================================================================

describe("initCurrentVersion", () => {
  it("uses version from installed package with isCurrent: true", () => {
    mockListPackages.mockReturnValue([
      { version: "1.0.0", path: "/pkg/v1.0.0", isCurrent: true, manifest: {} },
    ]);

    const updater = createUpdater();
    expect(updater.getStatus().currentVersion).toBe("1.0.0");
  });

  it("falls back to bundled package manifest when no current package", () => {
    mockListPackages.mockReturnValue([]);
    mockGetBundledPackagePath.mockReturnValue("/bundled/path");
    mockGetPackageManifest.mockReturnValue({ name: "kombuse", version: "0.9.0", type: "app" });

    const updater = createUpdater();
    expect(updater.getStatus().currentVersion).toBe("0.9.0");
    expect(mockGetPackageManifest).toHaveBeenCalledWith("/bundled/path");
  });

  it("defaults to '0.0.0' when both installed and bundled fail", () => {
    mockListPackages.mockReturnValue([]);
    mockGetPackageManifest.mockImplementation(() => {
      throw new Error("manifest not found");
    });

    const updater = createUpdater();
    expect(updater.getStatus().currentVersion).toBe("0.0.0");
  });

  it("defaults to '0.0.0' when listPackages throws", () => {
    mockListPackages.mockImplementation(() => {
      throw new Error("fs error");
    });

    const updater = createUpdater();
    expect(updater.getStatus().currentVersion).toBe("0.0.0");
  });
});

// ===========================================================================
// 3. checkForUpdates — state transitions
// ===========================================================================

describe("checkForUpdates", () => {
  it("idle → checking → available with mapped UpdateInfo", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_HAS_UPDATE);

    const updater = createUpdater();
    const states: string[] = [];
    updater.onStatusChange((s) => states.push(s.state));

    const result = await updater.checkForUpdates();

    expect(states).toContain("checking");
    expect(result.hasUpdate).toBe(true);
    expect(result.updateInfo).not.toBeNull();
    expect(result.updateInfo!.version).toBe("1.1.0");
    expect(result.updateInfo!.downloadUrl).toBe("https://example.com/pkg.tar.gz");
    expect(result.updateInfo!.releaseNotes).toBe("Bug fixes");
    expect(result.updateInfo!.publishedAt).toBe("2026-03-06T12:00:00Z");
    expect(result.currentVersion).toBe(updater.getStatus().currentVersion);
    expect(updater.getStatus().state).toBe("available");
  });

  it("idle → checking → idle when no update", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_NO_UPDATE);

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.updateInfo).toBeNull();
    expect(updater.getStatus().state).toBe("idle");
  });

  it("idle → checking → idle when hasUpdate true but latest is null", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue({
      hasUpdate: true,
      latest: null,
      currentVersion: "1.0.0",
    });

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.updateInfo).toBeNull();
    expect(updater.getStatus().state).toBe("idle");
  });

  it("idle → checking → error on rejection (re-throws)", async () => {
    mockPackageManager.checkForUpdates.mockRejectedValue(new Error("Network timeout"));

    const updater = createUpdater();
    await expect(updater.checkForUpdates()).rejects.toThrow("Network timeout");

    const status = updater.getStatus();
    expect(status.state).toBe("error");
    expect(status.error).toBe("Network timeout");
  });

  it("error with non-Error object uses 'Unknown error'", async () => {
    mockPackageManager.checkForUpdates.mockRejectedValue("string error");

    const updater = createUpdater();
    await expect(updater.checkForUpdates()).rejects.toBe("string error");

    expect(updater.getStatus().error).toBe("Unknown error");
  });
});

// ===========================================================================
// 4. downloadAndInstall — state transitions
// ===========================================================================

describe("downloadAndInstall", () => {
  it("throws when no update is available", async () => {
    const updater = createUpdater();
    await expect(updater.downloadAndInstall()).rejects.toThrow("No update available");
  });

  it("happy path: downloading → verifying → ready", async () => {
    // First set up an available update
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_HAS_UPDATE);
    mockPackageManager.install.mockResolvedValue(MOCK_INSTALL_RESULT);
    mockInstallPackage.mockReturnValue("1.1.0");

    const updater = createUpdater();
    await updater.checkForUpdates();

    const states: string[] = [];
    updater.onStatusChange((s) => states.push(s.state));

    await updater.downloadAndInstall();

    expect(states).toContain("downloading");
    expect(states[states.length - 1]).toBe("ready");
    expect(mockInstallPackage).toHaveBeenCalledWith(join(MOCK_INSTALL_RESULT.cachePath, "content"));

    const status = updater.getStatus();
    expect(status.state).toBe("ready");
    expect(status.currentVersion).toBe("1.1.0");
    expect(status.downloadProgress).toBe(100);
  });

  it("progress callback fires setState correctly for downloading phase", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_HAS_UPDATE);
    mockPackageManager.install.mockImplementation(async (_name, _ver, onProgress) => {
      onProgress?.({ phase: "downloading", percent: 50, bytesDownloaded: 500, bytesTotal: 1000 });
      onProgress?.({ phase: "verifying", percent: 0, bytesDownloaded: 1000, bytesTotal: 1000 });
      return MOCK_INSTALL_RESULT;
    });
    mockInstallPackage.mockReturnValue("1.1.0");

    const updater = createUpdater();
    await updater.checkForUpdates();

    const statuses: Array<{ state: string; downloadProgress: number }> = [];
    updater.onStatusChange((s) => statuses.push({ state: s.state, downloadProgress: s.downloadProgress }));

    await updater.downloadAndInstall();

    // Should have downloading with 0, downloading with 50, verifying, and ready
    const downloadingStates = statuses.filter((s) => s.state === "downloading");
    expect(downloadingStates.length).toBeGreaterThanOrEqual(2);
    expect(downloadingStates.some((s) => s.downloadProgress === 50)).toBe(true);

    const verifyingStates = statuses.filter((s) => s.state === "verifying");
    expect(verifyingStates.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores non-downloading/verifying phases (extracting, caching)", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_HAS_UPDATE);
    mockPackageManager.install.mockImplementation(async (_name, _ver, onProgress) => {
      onProgress?.({ phase: "downloading", percent: 100, bytesDownloaded: 1000, bytesTotal: 1000 });
      onProgress?.({ phase: "extracting", percent: 50, bytesDownloaded: 0, bytesTotal: 0 });
      onProgress?.({ phase: "caching", percent: 100, bytesDownloaded: 0, bytesTotal: 0 });
      return MOCK_INSTALL_RESULT;
    });
    mockInstallPackage.mockReturnValue("1.1.0");

    const updater = createUpdater();
    await updater.checkForUpdates();

    const states: string[] = [];
    updater.onStatusChange((s) => states.push(s.state));

    await updater.downloadAndInstall();

    // Should NOT contain extracting or caching states
    expect(states).not.toContain("extracting");
    expect(states).not.toContain("caching");
  });

  it("error path: install rejects → state 'error', re-throws", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_HAS_UPDATE);
    mockPackageManager.install.mockRejectedValue(new Error("Download failed"));

    const updater = createUpdater();
    await updater.checkForUpdates();

    await expect(updater.downloadAndInstall()).rejects.toThrow("Download failed");

    const status = updater.getStatus();
    expect(status.state).toBe("error");
    expect(status.error).toBe("Download failed");
  });
});

// ===========================================================================
// 5. clearCache
// ===========================================================================

describe("clearCache", () => {
  it("calls clearCache on feeds that have the method", () => {
    const feedWithClear = { id: "feed-1", name: "Feed 1", clearCache: vi.fn() };
    mockPackageManager.getFeeds.mockReturnValue([feedWithClear]);

    const updater = createUpdater();
    updater.clearCache();

    expect(feedWithClear.clearCache).toHaveBeenCalledOnce();
  });

  it("skips feeds without clearCache (no error thrown)", () => {
    const feedWithoutClear = { id: "feed-2", name: "Feed 2" };
    mockPackageManager.getFeeds.mockReturnValue([feedWithoutClear]);

    const updater = createUpdater();
    expect(() => updater.clearCache()).not.toThrow();
  });

  it("no error when getFeeds returns empty array", () => {
    mockPackageManager.getFeeds.mockReturnValue([]);

    const updater = createUpdater();
    expect(() => updater.clearCache()).not.toThrow();
  });
});

// ===========================================================================
// 6. onStatusChange — listener lifecycle
// ===========================================================================

describe("status listeners", () => {
  it("listener receives shallow copy on each setState", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_NO_UPDATE);

    const updater = createUpdater();
    const listener = vi.fn();
    updater.onStatusChange(listener);

    await updater.checkForUpdates();

    expect(listener).toHaveBeenCalled();
    const received = listener.mock.calls[0]![0];
    expect(received).not.toBe(updater.getStatus());
  });

  it("unsubscribe stops further notifications", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_NO_UPDATE);

    const updater = createUpdater();
    const listener = vi.fn();
    const unsubscribe = updater.onStatusChange(listener);

    await updater.checkForUpdates();
    const callCount = listener.mock.calls.length;

    unsubscribe();

    // Trigger another state change
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_NO_UPDATE);
    await updater.checkForUpdates();

    expect(listener.mock.calls.length).toBe(callCount);
  });

  it("multiple listeners all receive updates", async () => {
    mockPackageManager.checkForUpdates.mockResolvedValue(MOCK_CHECK_RESULT_NO_UPDATE);

    const updater = createUpdater();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    updater.onStatusChange(listener1);
    updater.onStatusChange(listener2);

    await updater.checkForUpdates();

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. getStatus
// ===========================================================================

describe("getStatus", () => {
  it("returns current status with correct fields", () => {
    const updater = createUpdater();
    const status = updater.getStatus();

    expect(status).toHaveProperty("state");
    expect(status).toHaveProperty("currentVersion");
    expect(status).toHaveProperty("updateInfo");
    expect(status).toHaveProperty("downloadProgress");
    expect(status).toHaveProperty("error");
  });

  it("returns a shallow copy — mutations don't affect internal state", () => {
    const updater = createUpdater();
    const status1 = updater.getStatus();
    status1.state = "error";
    status1.error = "hacked";

    const status2 = updater.getStatus();
    expect(status2.state).toBe("idle");
    expect(status2.error).toBeNull();
  });
});
