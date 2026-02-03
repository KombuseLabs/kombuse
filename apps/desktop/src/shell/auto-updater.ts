/**
 * Auto-updater for Kombuse packages.
 *
 * Checks GitHub releases for new package versions, downloads them,
 * verifies checksums, and installs them for the next app restart.
 */

import { createWriteStream, createReadStream, existsSync, rmSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "tar";
import type { UpdateInfo, UpdateStatus, UpdateCheckResult, UpdateState } from "@kombuse/types";
import { installPackage, listPackages } from "./updater";

// Update server endpoint (proxies GitHub releases with auth)
// Set UPDATE_API_BASE env var to override (e.g., for local testing)
const UPDATE_API_BASE = process.env.UPDATE_API_BASE ?? "https://kombuse.dev";
const UPDATE_API_URL = `${UPDATE_API_BASE}/api/updates/latest`;

/**
 * Resolve a URL that may be relative to the update API base.
 */
function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${UPDATE_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

interface UpdateApiResponse {
  version: string;
  downloadUrl: string;
  checksumUrl: string;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string;
}

type StatusListener = (status: UpdateStatus) => void;

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

  constructor() {
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
        console.log(`[AutoUpdater] No installed packages found, using default version: ${this.status.currentVersion}`);
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
   * Check GitHub releases for a newer package version.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    console.log(`[AutoUpdater] Checking for updates... (current: ${this.status.currentVersion})`);
    this.setState("checking", { error: null });

    try {
      const release = await this.fetchLatestRelease();
      if (!release) {
        console.log("[AutoUpdater] No releases found");
        this.setState("idle");
        return { hasUpdate: false, updateInfo: null, currentVersion: this.status.currentVersion };
      }

      const hasUpdate = this.isNewerVersion(release.version, this.status.currentVersion);
      console.log(`[AutoUpdater] Latest release: ${release.version}, hasUpdate: ${hasUpdate}`);

      if (!hasUpdate) {
        this.setState("idle");
        return { hasUpdate: false, updateInfo: null, currentVersion: this.status.currentVersion };
      }

      const updateInfo: UpdateInfo = {
        version: release.version,
        releaseUrl: release.releaseUrl,
        downloadUrl: resolveUrl(release.downloadUrl),
        checksumUrl: resolveUrl(release.checksumUrl),
        releaseNotes: release.releaseNotes,
        publishedAt: release.publishedAt,
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

    const tempDir = join(tmpdir(), `kombuse-update-${Date.now()}`);
    const tarPath = join(tempDir, `package-${updateInfo.version}.tar.gz`);

    try {
      mkdirSync(tempDir, { recursive: true });
      console.log(`[AutoUpdater] Created temp dir: ${tempDir}`);

      // Download
      this.setState("downloading", { downloadProgress: 0 });
      console.log(`[AutoUpdater] Downloading from: ${updateInfo.downloadUrl}`);
      await this.downloadFile(updateInfo.downloadUrl, tarPath);

      if (!existsSync(tarPath)) {
        throw new Error(`Downloaded file not found: ${tarPath}`);
      }
      const { statSync } = await import("node:fs");
      const fileSize = statSync(tarPath).size;
      console.log(`[AutoUpdater] Downloaded ${fileSize} bytes to ${tarPath}`);

      // Verify checksum
      this.setState("verifying");
      console.log(`[AutoUpdater] Verifying checksum from: ${updateInfo.checksumUrl}`);
      await this.verifyChecksum(tarPath, updateInfo.checksumUrl);
      console.log(`[AutoUpdater] Checksum verified`);

      // Extract
      console.log(`[AutoUpdater] Extracting to ${tempDir}`);
      await extract({ file: tarPath, cwd: tempDir });

      // List extracted contents for debugging
      const { readdirSync } = await import("node:fs");
      const contents = readdirSync(tempDir);
      console.log(`[AutoUpdater] Extracted contents: ${contents.join(", ")}`);

      // Install (tar extracts to 'package/' directory)
      const packageDir = join(tempDir, "package");
      if (!existsSync(packageDir)) {
        throw new Error(`Extracted package directory not found. Contents: ${contents.join(", ")}`);
      }

      const installedVersion = installPackage(packageDir);

      this.setState("ready", {
        currentVersion: installedVersion,
        downloadProgress: 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Install failed";
      this.setState("error", { error: message });
      throw error;
    } finally {
      // Cleanup temp files
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  private async fetchLatestRelease(): Promise<UpdateApiResponse | null> {
    console.log(`[AutoUpdater] Fetching from ${UPDATE_API_URL}`);
    const response = await fetch(UPDATE_API_URL);

    if (!response.ok) {
      throw new Error(`Update API error: ${response.status}`);
    }

    const data = await response.json();

    // API returns null if no releases found
    if (!data || !data.version) {
      return null;
    }

    return data as UpdateApiResponse;
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
    let downloaded = 0;

    const fileStream = createWriteStream(destPath);
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(value);
        downloaded += value.length;

        if (contentLength > 0) {
          const progress = Math.round((downloaded / contentLength) * 100);
          this.status.downloadProgress = progress;
          this.emit();
        }
      }
    } finally {
      fileStream.end();
    }

    // Wait for file to finish writing
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });
  }

  private async verifyChecksum(filePath: string, checksumUrl: string): Promise<void> {
    // Download expected checksum
    const response = await fetch(checksumUrl);
    if (!response.ok) {
      throw new Error("Failed to download checksum");
    }

    const checksumContent = await response.text();
    const expectedHash = checksumContent.split(/\s+/)[0]?.toLowerCase();

    if (!expectedHash || expectedHash.length !== 64) {
      throw new Error("Invalid checksum format");
    }

    // Calculate actual checksum
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    const actualHash = hash.digest("hex").toLowerCase();

    if (actualHash !== expectedHash) {
      throw new Error(`Checksum mismatch: expected ${expectedHash.slice(0, 8)}..., got ${actualHash.slice(0, 8)}...`);
    }
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split(".").map(Number);
    const currentParts = current.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      const l = latestParts[i] ?? 0;
      const c = currentParts[i] ?? 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }
}

// Singleton instance
export const autoUpdater = new AutoUpdater();
