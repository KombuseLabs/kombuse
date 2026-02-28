/**
 * Shell (Electron) auto-updater.
 *
 * Wraps electron-updater's autoUpdater to check GitHub Releases for new
 * shell versions, download updates, and quit-and-install.
 * Implements the same AutoUpdaterInterface as the package auto-updater
 * so server routes and WebSocket broadcasting work identically.
 */

import { app } from "electron";
import pkg from "electron-updater";
const { autoUpdater: electronAutoUpdater } = pkg;
import type { UpdateInfo, UpdateStatus, UpdateCheckResult, UpdateState } from "@kombuse/types";

type StatusListener = (status: UpdateStatus) => void;

// Error messages indicating code-signing issues on macOS
const SIGNING_ERROR_PATTERNS = [
  "code signature",
  "is not signed",
  "err_updater_invalid_signature",
  "could not get code signature",
  "a sealed resource is missing or invalid",
];

export class ShellUpdater {
  private status: UpdateStatus = {
    state: "idle",
    currentVersion: "0.0.0",
    updateInfo: null,
    downloadProgress: 0,
    error: null,
  };

  private statusListeners = new Set<StatusListener>();
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private unsignedBuild = false;

  constructor() {
    this.status.currentVersion = app.getVersion();

    // Configure electron-updater
    electronAutoUpdater.autoDownload = false;
    electronAutoUpdater.autoInstallOnAppQuit = false;

    // Wire event listeners
    electronAutoUpdater.on("checking-for-update", () => {
      this.setState("checking", { error: null });
    });

    electronAutoUpdater.on("update-available", (info) => {
      const updateInfo = this.mapUpdateInfo(info);
      this.setState("available", { updateInfo });
    });

    electronAutoUpdater.on("update-not-available", () => {
      this.setState("idle");
    });

    electronAutoUpdater.on("download-progress", (progress) => {
      this.status.downloadProgress = Math.round(progress.percent);
      this.emit();
    });

    electronAutoUpdater.on("update-downloaded", () => {
      this.setState("ready", { downloadProgress: 100 });
    });

    electronAutoUpdater.on("error", (err) => {
      const message = err.message ?? "Unknown error";

      // Detect code-signing errors and degrade gracefully
      const lowerMessage = message.toLowerCase();
      if (SIGNING_ERROR_PATTERNS.some((p) => lowerMessage.includes(p))) {
        console.warn("[ShellUpdater] Code-signing error detected, disabling shell auto-updates:", message);
        this.unsignedBuild = true;
        this.stopPeriodicChecks();
        this.setState("idle", { error: null });
        return;
      }

      this.setState("error", { error: message });
    });

    console.log(`[ShellUpdater] Initialized (version: ${this.status.currentVersion})`);
  }

  private mapUpdateInfo(info: { version: string; releaseDate: string; releaseNotes?: string | Array<{ note: string | null }> | null }): UpdateInfo {
    const releaseNotes = typeof info.releaseNotes === "string"
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n) => n.note ?? "").join("\n")
        : null;

    return {
      version: info.version,
      downloadUrl: "",
      releaseUrl: `https://github.com/KombuseLabs/kombuse/releases/tag/shell-v${info.version}`,
      releaseNotes,
      publishedAt: info.releaseDate ?? new Date().toISOString(),
    };
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.statusListeners) {
      listener({ ...this.status });
    }
  }

  private setState(state: UpdateState, partial?: Partial<Omit<UpdateStatus, "state">>): void {
    this.status = { ...this.status, state, ...partial };
    this.emit();
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    // Skip check on unsigned builds
    if (this.unsignedBuild) {
      console.log("[ShellUpdater] Skipping update check (unsigned build)");
      return { hasUpdate: false, updateInfo: null, currentVersion: this.status.currentVersion };
    }

    console.log(`[ShellUpdater] Checking for updates... (current: ${this.status.currentVersion})`);

    try {
      const result = await electronAutoUpdater.checkForUpdates();

      if (!result || !result.updateInfo) {
        return { hasUpdate: false, updateInfo: null, currentVersion: this.status.currentVersion };
      }

      const hasUpdate = this.status.state === "available";
      return {
        hasUpdate,
        updateInfo: hasUpdate ? this.status.updateInfo : null,
        currentVersion: this.status.currentVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      // Don't re-set error state here — the electron-updater error event already handles it
      throw new Error(message);
    }
  }

  async downloadAndInstall(): Promise<void> {
    if (!this.status.updateInfo) {
      throw new Error("No update available");
    }

    console.log(`[ShellUpdater] Downloading update v${this.status.updateInfo.version}...`);
    this.setState("downloading", { downloadProgress: 0 });

    await electronAutoUpdater.downloadUpdate();
    // State transitions to "ready" via the update-downloaded event
  }

  quitAndInstall(): void {
    console.log("[ShellUpdater] Quit and install requested");
    electronAutoUpdater.quitAndInstall(false, true);
  }

  startPeriodicChecks(intervalMs = 24 * 60 * 60 * 1000, initialDelayMs = 10_000): void {
    this.stopPeriodicChecks();

    const doCheck = () => {
      if (this.status.state !== "idle" && this.status.state !== "error") return;
      this.checkForUpdates().catch((err) => {
        console.error("[ShellUpdater] Periodic update check failed:", err);
      });
    };

    this.initialTimer = setTimeout(() => {
      doCheck();
      this.periodicTimer = setInterval(doCheck, intervalMs);
    }, initialDelayMs);

    console.log(`[ShellUpdater] Periodic checks started (every ${intervalMs / 3600000}h, first in ${initialDelayMs / 1000}s)`);
  }

  stopPeriodicChecks(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }
}
