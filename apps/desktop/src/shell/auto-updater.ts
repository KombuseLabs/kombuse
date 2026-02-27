/**
 * Auto-updater for Kombuse packages.
 *
 * Checks for new package versions via @kombuse/pkg, downloads them,
 * and installs them for the next app restart.
 */

import { join } from "node:path";
import { PackageManager, HttpFeed } from "@kombuse/pkg";
import type { DownloadProgress } from "@kombuse/pkg";
import type { UpdateInfo, UpdateStatus, UpdateCheckResult, UpdateState } from "@kombuse/types";
import { installPackage, listPackages } from "./updater";
import { getPackageManifest, getBundledPackagePath } from "./package-loader";

type StatusListener = (status: UpdateStatus) => void;

const UPDATE_API_BASE = process.env.UPDATE_API_BASE ?? "https://kombuse.dev";

/**
 * Auto-updater class that manages checking, downloading, and installing updates.
 */
export class AutoUpdater {
  private status: UpdateStatus = {
    state: "idle",
    currentVersion: "0.0.0",
    updateInfo: null,
    downloadProgress: 0,
    error: null,
  };

  private statusListeners = new Set<StatusListener>();
  private readonly packageManager: PackageManager;

  constructor() {
    this.packageManager = new PackageManager();
    this.packageManager.addFeed(new HttpFeed({ baseUrl: UPDATE_API_BASE }));
    this.initCurrentVersion();
  }

  private initCurrentVersion(): void {
    try {
      const packages = listPackages();
      const current = packages.find((p) => p.isCurrent);
      if (current) {
        this.status.currentVersion = current.version;
        console.log(`[AutoUpdater] Current version from installed packages: ${current.version}`);
      } else {
        // Fallback: read version from the bundled package manifest
        try {
          const bundledManifest = getPackageManifest(getBundledPackagePath());
          this.status.currentVersion = bundledManifest.version;
          console.log(`[AutoUpdater] Current version from bundled package: ${bundledManifest.version}`);
        } catch {
          console.log(`[AutoUpdater] No installed or bundled package found, using default: ${this.status.currentVersion}`);
        }
      }
    } catch (err) {
      console.log(`[AutoUpdater] Error reading packages: ${err}`);
    }
  }

  /**
   * Subscribe to status changes.
   * @returns Unsubscribe function
   */
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

  /**
   * Get the current update status.
   */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /**
   * Check for a newer package version.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    console.log(`[AutoUpdater] Checking for updates... (current: ${this.status.currentVersion})`);
    this.setState("checking", { error: null });

    try {
      const result = await this.packageManager.checkForUpdates("kombuse/kombuse", this.status.currentVersion);
      console.log(`[AutoUpdater] Check result: hasUpdate=${result.hasUpdate}, latest=${result.latest?.version ?? "none"}`);

      if (!result.hasUpdate || !result.latest) {
        this.setState("idle");
        return { hasUpdate: false, updateInfo: null, currentVersion: this.status.currentVersion };
      }

      const latest = result.latest;

      const updateInfo: UpdateInfo = {
        version: latest.version,
        downloadUrl: latest.downloadUrl ?? "",
        releaseNotes: latest.manifest.release_notes ?? null,
        publishedAt: latest.publishedAt ?? "",
      };

      this.setState("available", { updateInfo });
      return { hasUpdate: true, updateInfo, currentVersion: this.status.currentVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.setState("error", { error: message });
      throw error;
    }
  }

  /**
   * Download and install the available update.
   */
  async downloadAndInstall(): Promise<void> {
    const { updateInfo } = this.status;
    if (!updateInfo) {
      throw new Error("No update available");
    }

    try {
      this.setState("downloading", { downloadProgress: 0 });
      console.log(`[AutoUpdater] Installing version ${updateInfo.version}`);

      const result = await this.packageManager.install("kombuse/kombuse", updateInfo.version, (progress: DownloadProgress) => {
        if (progress.phase === "downloading") {
          this.setState("downloading", {
            downloadProgress: progress.percent >= 0 ? progress.percent : 0,
          });
        } else if (progress.phase === "verifying") {
          this.setState("verifying");
        }
        // extracting and caching phases are internal details
      });

      console.log(`[AutoUpdater] Downloaded and cached at ${result.cachePath}`);

      // Install from cache to packages directory (symlink management)
      const contentPath = join(result.cachePath, "content");
      const installedVersion = installPackage(contentPath);

      this.setState("ready", {
        currentVersion: installedVersion,
        downloadProgress: 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Install failed";
      this.setState("error", { error: message });
      throw error;
    }
  }
}

// Singleton instance
export const autoUpdater = new AutoUpdater();
