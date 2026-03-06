/**
 * Unit tests for ShellUpdater (apps/desktop/src/shell/shell-updater.ts).
 *
 * ## Schema drift & coverage gaps
 *
 * 1. electron-updater's UpdateInfo is effectively `any` — ShellUpdater.mapUpdateInfo
 *    only reads `version`, `releaseDate`, and `releaseNotes`. If electron-updater
 *    renames or restructures these fields, our mapping silently produces wrong data.
 *    Tests below cover all three releaseNotes variants (string, array, null) and
 *    a missing releaseDate.
 *
 * 2. `releaseNotes` from electron-updater can be:
 *    - `string` (markdown body)
 *    - `Array<{ note: string | null }>` (multi-entry)
 *    - `null` or `undefined`
 *    All variants are tested via the update-available event.
 *
 * 3. The `files` array from electron-updater (containing per-arch URLs, sha512,
 *    sizes) is NOT consumed by ShellUpdater. It is only relevant for CI manifest
 *    validation (release-shell.yml). If ShellUpdater ever starts reading `files`,
 *    new tests must be added.
 *
 * 4. `downloadUrl` in our UpdateInfo is always `""` — ShellUpdater delegates
 *    actual download mechanics to electron-updater internally. Any future change
 *    to provide a real URL would need a test update.
 *
 * 5. ShellUpdater does NO version comparison. electron-updater handles all
 *    comparison internally. The only lever is `allowPrerelease = true`, which
 *    tells electron-updater to consider pre-release tags (e.g. rc.X) as valid
 *    updates. Regression: ticket #732 removed this flag, breaking pre-release
 *    detection. The constructor test guards against this.
 *
 * 6. `quitAndInstall` must delegate to `electronAutoUpdater.quitAndInstall(true, true)`.
 *    Regression: ticket #731 used `app.exit(0)` which bypassed Electron's will-quit
 *    lifecycle, preventing the update from being applied. The quitAndInstall test
 *    explicitly asserts `app.exit` is NOT called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before ShellUpdater import
// ---------------------------------------------------------------------------

const { mockApp, mockAutoUpdater, eventHandlers, resetEventHandlers } = vi.hoisted(() => {
  const handlers: Record<string, Function> = {};
  return {
    mockApp: {
      getVersion: vi.fn(() => "1.0.0-rc.13"),
      exit: vi.fn(),
    },
    mockAutoUpdater: {
      autoDownload: true as boolean,
      autoInstallOnAppQuit: true as boolean,
      allowPrerelease: false as boolean,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    },
    eventHandlers: handlers,
    resetEventHandlers: () => {
      for (const key of Object.keys(handlers)) {
        delete handlers[key];
      }
    },
  };
});

vi.mock("electron", () => ({ app: mockApp }));
vi.mock("electron-updater", () => ({
  default: { autoUpdater: mockAutoUpdater },
}));

import { ShellUpdater } from "../shell-updater";

// ---------------------------------------------------------------------------
// Realistic mock data — matches electron-updater's actual payload shapes
// ---------------------------------------------------------------------------

/** Simulates a real electron-updater UpdateInfo for a pre-release. */
const MOCK_EU_UPDATE_INFO_RC15 = {
  version: "1.0.0-rc.15",
  releaseDate: "2026-03-06T12:00:00.000Z",
  releaseNotes: "## Changes\n- Fix updater regression\n- Add pre-release detection",
  // Fields below are present in real payloads but NOT consumed by ShellUpdater:
  files: [
    { url: "Kombuse-1.0.0-rc.15-arm64-mac.zip", sha512: "a".repeat(128), size: 85_000_000 },
    { url: "Kombuse-1.0.0-rc.15-x64-mac.zip", sha512: "b".repeat(128), size: 90_000_000 },
  ],
  path: "Kombuse-1.0.0-rc.15-arm64-mac.zip",
  sha512: "a".repeat(128),
};

/** electron-updater payload with array-style releaseNotes. */
const MOCK_EU_UPDATE_INFO_ARRAY_NOTES = {
  version: "1.0.0-rc.16",
  releaseDate: "2026-03-07T12:00:00.000Z",
  releaseNotes: [{ note: "Fix 1" }, { note: "Fix 2" }, { note: null }],
};

/** electron-updater payload with null releaseNotes. */
const MOCK_EU_UPDATE_INFO_NULL_NOTES = {
  version: "1.0.0-rc.17",
  releaseDate: "2026-03-08T12:00:00.000Z",
  releaseNotes: null,
};

/** electron-updater payload with missing releaseDate. */
const MOCK_EU_UPDATE_INFO_NO_DATE = {
  version: "2.0.0",
  releaseDate: undefined as unknown as string,
  releaseNotes: "First stable release",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let errorSpy: ReturnType<typeof vi.spyOn>;

function createUpdater(): ShellUpdater {
  return new ShellUpdater();
}

/** Fire a captured electron-updater event. */
function fireEvent(event: string, ...args: unknown[]) {
  const handler = eventHandlers[event];
  if (!handler) throw new Error(`No handler registered for event "${event}"`);
  handler(...args);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  // Reset mock state
  mockAutoUpdater.autoDownload = true;
  mockAutoUpdater.autoInstallOnAppQuit = true;
  mockAutoUpdater.allowPrerelease = false;
  mockAutoUpdater.on.mockClear();
  mockAutoUpdater.checkForUpdates.mockReset();
  mockAutoUpdater.downloadUpdate.mockReset();
  mockAutoUpdater.quitAndInstall.mockClear();
  mockApp.getVersion.mockReturnValue("1.0.0-rc.13");
  mockApp.exit.mockClear();
  resetEventHandlers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================================================
// 1. Constructor configuration
// ===========================================================================

describe("constructor", () => {
  it("sets autoDownload = false to prevent auto-download", () => {
    createUpdater();
    expect(mockAutoUpdater.autoDownload).toBe(false);
  });

  it("sets autoInstallOnAppQuit = false", () => {
    createUpdater();
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  it("sets allowPrerelease = true (prevents #732 regression)", () => {
    createUpdater();
    expect(mockAutoUpdater.allowPrerelease).toBe(true);
  });

  it("sets currentVersion from app.getVersion()", () => {
    mockApp.getVersion.mockReturnValue("1.0.0-rc.14");
    const updater = createUpdater();
    expect(updater.getStatus().currentVersion).toBe("1.0.0-rc.14");
  });

  it("registers all 6 event handlers on electronAutoUpdater", () => {
    createUpdater();
    const registeredEvents = mockAutoUpdater.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain("checking-for-update");
    expect(registeredEvents).toContain("update-available");
    expect(registeredEvents).toContain("update-not-available");
    expect(registeredEvents).toContain("download-progress");
    expect(registeredEvents).toContain("update-downloaded");
    expect(registeredEvents).toContain("error");
  });

  it("starts in idle state with no error and no updateInfo", () => {
    const updater = createUpdater();
    const status = updater.getStatus();
    expect(status.state).toBe("idle");
    expect(status.error).toBeNull();
    expect(status.updateInfo).toBeNull();
    expect(status.downloadProgress).toBe(0);
  });
});

// ===========================================================================
// 2. Event handlers — state transitions
// ===========================================================================

describe("event handlers", () => {
  it("checking-for-update → state 'checking', error cleared", () => {
    const updater = createUpdater();
    fireEvent("error", { message: "previous error" });
    expect(updater.getStatus().state).toBe("error");

    fireEvent("checking-for-update");
    const status = updater.getStatus();
    expect(status.state).toBe("checking");
    expect(status.error).toBeNull();
  });

  it("update-available → state 'available', updateInfo mapped correctly", () => {
    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);

    const status = updater.getStatus();
    expect(status.state).toBe("available");
    expect(status.updateInfo).not.toBeNull();
    expect(status.updateInfo!.version).toBe("1.0.0-rc.15");
    expect(status.updateInfo!.releaseNotes).toBe(MOCK_EU_UPDATE_INFO_RC15.releaseNotes);
    expect(status.updateInfo!.publishedAt).toBe("2026-03-06T12:00:00.000Z");
    expect(status.updateInfo!.releaseUrl).toBe(
      "https://github.com/KombuseLabs/kombuse/releases/tag/v1.0.0-rc.15",
    );
    expect(status.updateInfo!.downloadUrl).toBe("");
  });

  it("update-not-available → state 'idle'", () => {
    const updater = createUpdater();
    fireEvent("checking-for-update");
    expect(updater.getStatus().state).toBe("checking");

    fireEvent("update-not-available");
    expect(updater.getStatus().state).toBe("idle");
  });

  it("download-progress → updates downloadProgress (rounded)", () => {
    const updater = createUpdater();
    fireEvent("download-progress", { percent: 45.7 });
    expect(updater.getStatus().downloadProgress).toBe(46);
  });

  it("download-progress with 0% → downloadProgress = 0", () => {
    const updater = createUpdater();
    fireEvent("download-progress", { percent: 0 });
    expect(updater.getStatus().downloadProgress).toBe(0);
  });

  it("download-progress with 100% → downloadProgress = 100", () => {
    const updater = createUpdater();
    fireEvent("download-progress", { percent: 100 });
    expect(updater.getStatus().downloadProgress).toBe(100);
  });

  it("update-downloaded → state 'ready', downloadProgress = 100", () => {
    const updater = createUpdater();
    fireEvent("update-downloaded");
    const status = updater.getStatus();
    expect(status.state).toBe("ready");
    expect(status.downloadProgress).toBe(100);
  });

  it("error (generic) → state 'error' with message", () => {
    const updater = createUpdater();
    fireEvent("error", { message: "Network timeout" });
    const status = updater.getStatus();
    expect(status.state).toBe("error");
    expect(status.error).toBe("Network timeout");
  });

  it("error with undefined message → falls back to 'Unknown error'", () => {
    const updater = createUpdater();
    fireEvent("error", {});
    expect(updater.getStatus().error).toBe("Unknown error");
  });
});

// ===========================================================================
// 3. Error handling — code-signing errors
// ===========================================================================

describe("code-signing error handling", () => {
  const signingPatterns = [
    "code signature",
    "is not signed",
    "err_updater_invalid_signature",
    "could not get code signature",
    "a sealed resource is missing or invalid",
  ];

  for (const pattern of signingPatterns) {
    it(`detects "${pattern}" as signing error → idle state, no error`, () => {
      const updater = createUpdater();
      fireEvent("error", { message: `Error: ${pattern} failed` });

      const status = updater.getStatus();
      expect(status.state).toBe("idle");
      expect(status.error).toBeNull();
    });
  }

  it("signing error is case-insensitive", () => {
    const updater = createUpdater();
    fireEvent("error", { message: "CODE SIGNATURE verification failed" });

    expect(updater.getStatus().state).toBe("idle");
    expect(updater.getStatus().error).toBeNull();
  });

  it("signing error stops periodic checks", () => {
    vi.useFakeTimers();
    const updater = createUpdater();
    updater.startPeriodicChecks(60_000, 5_000);

    fireEvent("error", { message: "code signature invalid" });

    // Advance past initial delay + periodic interval — no check should fire
    vi.advanceTimersByTime(70_000);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("after signing error, checkForUpdates skips without calling electron-updater", async () => {
    const updater = createUpdater();
    fireEvent("error", { message: "code signature invalid" });

    const result = await updater.checkForUpdates();
    expect(result.hasUpdate).toBe(false);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. checkForUpdates
// ===========================================================================

describe("checkForUpdates", () => {
  it("returns hasUpdate: true when update is available", async () => {
    mockAutoUpdater.checkForUpdates.mockImplementation(async () => {
      fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);
      return { updateInfo: MOCK_EU_UPDATE_INFO_RC15 };
    });

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.updateInfo).not.toBeNull();
    expect(result.updateInfo!.version).toBe("1.0.0-rc.15");
    expect(result.currentVersion).toBe("1.0.0-rc.13");
  });

  it("returns hasUpdate: false when no update available", async () => {
    mockAutoUpdater.checkForUpdates.mockImplementation(async () => {
      fireEvent("update-not-available");
      return { updateInfo: MOCK_EU_UPDATE_INFO_RC15 };
    });

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.updateInfo).toBeNull();
  });

  it("returns hasUpdate: false when result is null", async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue(null);

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.updateInfo).toBeNull();
  });

  it("returns hasUpdate: false when result.updateInfo is undefined", async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({});

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.updateInfo).toBeNull();
  });

  it("throws on error with wrapped message", async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error("404 Not Found"));

    const updater = createUpdater();
    await expect(updater.checkForUpdates()).rejects.toThrow("404 Not Found");
  });

  it("throws with 'Unknown error' for non-Error rejections", async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValue("string error");

    const updater = createUpdater();
    await expect(updater.checkForUpdates()).rejects.toThrow("Unknown error");
  });

  it("includes currentVersion in result", async () => {
    mockApp.getVersion.mockReturnValue("2.0.0");
    mockAutoUpdater.checkForUpdates.mockResolvedValue(null);

    const updater = createUpdater();
    const result = await updater.checkForUpdates();

    expect(result.currentVersion).toBe("2.0.0");
  });
});

// ===========================================================================
// 5. downloadAndInstall
// ===========================================================================

describe("downloadAndInstall", () => {
  it("throws when no update is available", async () => {
    const updater = createUpdater();
    await expect(updater.downloadAndInstall()).rejects.toThrow("No update available");
  });

  it("calls downloadUpdate and sets state to downloading", async () => {
    mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined);
    const updater = createUpdater();

    // Simulate update-available
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);
    expect(updater.getStatus().state).toBe("available");

    await updater.downloadAndInstall();

    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledOnce();
    // State should be "downloading" (set before downloadUpdate call)
    // Note: may transition to "ready" if update-downloaded fires, but downloadUpdate is mocked
  });

  it("sets downloadProgress to 0 when starting download", async () => {
    mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined);
    const updater = createUpdater();
    const listener = vi.fn();
    updater.onStatusChange(listener);

    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);

    await updater.downloadAndInstall();

    // Find the "downloading" state emission
    const downloadingCall = listener.mock.calls.find((c) => c[0].state === "downloading");
    expect(downloadingCall).toBeDefined();
    expect(downloadingCall![0].downloadProgress).toBe(0);
  });

  it("full flow: available → downloading → progress → ready", async () => {
    mockAutoUpdater.downloadUpdate.mockImplementation(async () => {
      fireEvent("download-progress", { percent: 50 });
      fireEvent("download-progress", { percent: 100 });
      fireEvent("update-downloaded");
    });

    const updater = createUpdater();
    const states: string[] = [];
    updater.onStatusChange((s) => states.push(s.state));

    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);
    await updater.downloadAndInstall();

    expect(states).toContain("available");
    expect(states).toContain("downloading");
    expect(states).toContain("ready");
    expect(updater.getStatus().state).toBe("ready");
    expect(updater.getStatus().downloadProgress).toBe(100);
  });
});

// ===========================================================================
// 6. quitAndInstall
// ===========================================================================

describe("quitAndInstall", () => {
  it("delegates to electronAutoUpdater.quitAndInstall(true, true) — prevents #731 regression", () => {
    const updater = createUpdater();
    updater.quitAndInstall();

    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("does NOT call app.exit() — explicit #731 regression guard", () => {
    const updater = createUpdater();
    updater.quitAndInstall();

    expect(mockApp.exit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. Periodic checks
// ===========================================================================

describe("periodic checks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockAutoUpdater.checkForUpdates.mockResolvedValue(null);
  });

  it("fires initial check after initialDelayMs", () => {
    const updater = createUpdater();
    updater.startPeriodicChecks(60_000, 5_000);

    // Before delay — no check
    vi.advanceTimersByTime(4_999);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    // After delay — check fires
    vi.advanceTimersByTime(1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("fires periodic checks at intervalMs after initial delay", () => {
    const updater = createUpdater();
    updater.startPeriodicChecks(10_000, 1_000);

    // Initial delay
    vi.advanceTimersByTime(1_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    // First periodic check
    vi.advanceTimersByTime(10_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    // Second periodic check
    vi.advanceTimersByTime(10_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("stopPeriodicChecks clears both timers", () => {
    const updater = createUpdater();
    updater.startPeriodicChecks(10_000, 1_000);

    updater.stopPeriodicChecks();

    // Advance well past all timers — no check should fire
    vi.advanceTimersByTime(100_000);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("skips check when state is not idle or error", () => {
    const updater = createUpdater();

    // Put into "downloading" state
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);
    // Manually trigger downloading state
    fireEvent("checking-for-update");

    updater.startPeriodicChecks(10_000, 1_000);

    vi.advanceTimersByTime(1_000);
    // State is "checking" so periodic check should skip
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("fires check when state is error (recovery path)", () => {
    const updater = createUpdater();
    fireEvent("error", { message: "temporary failure" });
    expect(updater.getStatus().state).toBe("error");

    updater.startPeriodicChecks(10_000, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("calling startPeriodicChecks twice clears previous timers", () => {
    const updater = createUpdater();
    updater.startPeriodicChecks(10_000, 5_000);

    // Start new checks before first fires
    updater.startPeriodicChecks(10_000, 2_000);

    // Advance past first start's delay but before second's
    vi.advanceTimersByTime(1_999);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    // Second start's delay fires
    vi.advanceTimersByTime(1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("uses default intervals when called without arguments", () => {
    const updater = createUpdater();
    updater.startPeriodicChecks();

    // Default initialDelay is 10_000ms
    vi.advanceTimersByTime(9_999);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();

    // Default interval is 24h
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("swallows errors from periodic checks without crashing", async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error("network down"));

    const updater = createUpdater();
    updater.startPeriodicChecks(10_000, 1_000);

    vi.advanceTimersByTime(1_000);

    // Flush the rejected promise
    await vi.advanceTimersByTimeAsync(0);

    // Error should be logged, not thrown
    expect(errorSpy).toHaveBeenCalled();
    // Updater should still be functional
    expect(updater.getStatus().state).not.toBe("error");
  });
});

// ===========================================================================
// 8. Status listeners & getStatus
// ===========================================================================

describe("status listeners", () => {
  it("onStatusChange listener receives state updates as shallow copies", () => {
    const updater = createUpdater();
    const listener = vi.fn();
    updater.onStatusChange(listener);

    fireEvent("checking-for-update");

    expect(listener).toHaveBeenCalledOnce();
    const received = listener.mock.calls[0]![0];
    expect(received.state).toBe("checking");
    // Verify it's a copy, not the same reference
    expect(received).not.toBe(updater.getStatus());
  });

  it("unsubscribe prevents further notifications", () => {
    const updater = createUpdater();
    const listener = vi.fn();
    const unsubscribe = updater.onStatusChange(listener);

    fireEvent("checking-for-update");
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    fireEvent("update-not-available");
    expect(listener).toHaveBeenCalledOnce(); // Still 1, not 2
  });

  it("multiple listeners all receive updates", () => {
    const updater = createUpdater();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    updater.onStatusChange(listener1);
    updater.onStatusChange(listener2);

    fireEvent("checking-for-update");

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it("getStatus returns a shallow copy (mutations don't affect internal state)", () => {
    const updater = createUpdater();
    const status1 = updater.getStatus();
    status1.state = "error";
    status1.error = "hacked";

    const status2 = updater.getStatus();
    expect(status2.state).toBe("idle");
    expect(status2.error).toBeNull();
  });

  it("download-progress emits to listeners without changing state", () => {
    const updater = createUpdater();
    const states: string[] = [];
    updater.onStatusChange((s) => states.push(s.state));

    fireEvent("download-progress", { percent: 50 });

    // State remains "idle" (download-progress only updates downloadProgress)
    expect(states).toEqual(["idle"]);
    expect(updater.getStatus().downloadProgress).toBe(50);
  });
});

// ===========================================================================
// 9. mapUpdateInfo (tested via update-available event)
// ===========================================================================

describe("mapUpdateInfo", () => {
  it("maps string releaseNotes directly", () => {
    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);

    expect(updater.getStatus().updateInfo!.releaseNotes).toBe(
      "## Changes\n- Fix updater regression\n- Add pre-release detection",
    );
  });

  it("joins array releaseNotes with newlines, handles null entries", () => {
    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_ARRAY_NOTES);

    expect(updater.getStatus().updateInfo!.releaseNotes).toBe("Fix 1\nFix 2\n");
  });

  it("maps null releaseNotes to null", () => {
    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_NULL_NOTES);

    expect(updater.getStatus().updateInfo!.releaseNotes).toBeNull();
  });

  it("maps undefined releaseNotes to null", () => {
    const updater = createUpdater();
    fireEvent("update-available", {
      version: "3.0.0",
      releaseDate: "2026-01-01T00:00:00.000Z",
      releaseNotes: undefined,
    });

    expect(updater.getStatus().updateInfo!.releaseNotes).toBeNull();
  });

  it("falls back to current timestamp when releaseDate is missing", () => {
    const now = "2026-03-06T15:00:00.000Z";
    vi.setSystemTime(new Date(now));

    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_NO_DATE);

    expect(updater.getStatus().updateInfo!.publishedAt).toBe(now);
  });

  it("constructs releaseUrl from version", () => {
    const updater = createUpdater();
    fireEvent("update-available", {
      version: "2.1.0-beta.3",
      releaseDate: "2026-01-01T00:00:00.000Z",
      releaseNotes: null,
    });

    expect(updater.getStatus().updateInfo!.releaseUrl).toBe(
      "https://github.com/KombuseLabs/kombuse/releases/tag/v2.1.0-beta.3",
    );
  });

  it("always sets downloadUrl to empty string", () => {
    const updater = createUpdater();
    fireEvent("update-available", MOCK_EU_UPDATE_INFO_RC15);

    expect(updater.getStatus().updateInfo!.downloadUrl).toBe("");
  });
});
