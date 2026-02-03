/**
 * Payload updater for managing installed payloads.
 *
 * Payloads are stored in ~/.kombuse/payloads/ with a symlink to the current version.
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { PayloadManifest } from "./payload-loader";
import { getPayloadManifest } from "./payload-loader";
import {
  getKombuseDir,
  getPayloadsDir,
  getCurrentPayloadPath,
  getPayloadVersionPath,
} from "../paths";

// Re-export for convenience
export { getKombuseDir, getPayloadsDir };

/**
 * Get the path to the "current" symlink.
 */
export function getCurrentSymlinkPath(): string {
  return getCurrentPayloadPath();
}

/**
 * Ensure the payloads directory exists.
 */
export function ensurePayloadsDir(): void {
  const dir = getPayloadsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Install a payload from a source directory.
 *
 * @param sourcePath - Path to the payload directory to install
 * @returns The installed version string
 */
export function installPayload(sourcePath: string): string {
  // Read manifest to get version
  const manifest = getPayloadManifest(sourcePath);
  const version = manifest.version;

  ensurePayloadsDir();

  // Copy to versioned directory
  const destPath = getPayloadVersionPath(version);

  if (existsSync(destPath)) {
    // Remove existing version
    console.log(`Removing existing v${version}...`);
    cpSync(sourcePath, destPath, { recursive: true, force: true });
  } else {
    console.log(`Installing v${version}...`);
    cpSync(sourcePath, destPath, { recursive: true });
  }

  // Update current symlink
  updateCurrentSymlink(version);

  return version;
}

/**
 * Update the "current" symlink to point to a specific version.
 */
export function updateCurrentSymlink(version: string): void {
  const symlinkPath = getCurrentSymlinkPath();
  const targetPath = getPayloadVersionPath(version);

  if (!existsSync(targetPath)) {
    throw new Error(`Payload version not found: v${version}`);
  }

  // Remove existing symlink if it exists
  if (existsSync(symlinkPath) || lstatSync(symlinkPath).isSymbolicLink()) {
    unlinkSync(symlinkPath);
  }

  // Create new symlink
  symlinkSync(targetPath, symlinkPath);
  console.log(`Current payload set to v${version}`);
}

/**
 * List all installed payload versions.
 */
export function listPayloads(): Array<{
  version: string;
  path: string;
  isCurrent: boolean;
  manifest: PayloadManifest;
}> {
  const payloadsDir = getPayloadsDir();

  if (!existsSync(payloadsDir)) {
    return [];
  }

  // Get current version
  let currentVersion: string | null = null;
  const symlinkPath = getCurrentSymlinkPath();
  if (existsSync(symlinkPath)) {
    try {
      const target = readlinkSync(symlinkPath);
      const match = target.match(/v(\d+\.\d+\.\d+)/);
      if (match && match[1]) {
        currentVersion = match[1];
      }
    } catch {
      // Symlink doesn't exist or is broken
    }
  }

  // List version directories
  const entries = readdirSync(payloadsDir, { withFileTypes: true });
  const payloads: Array<{
    version: string;
    path: string;
    isCurrent: boolean;
    manifest: PayloadManifest;
  }> = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("v")) {
      const version = entry.name.slice(1); // Remove 'v' prefix
      const path = join(payloadsDir, entry.name);

      try {
        const manifest = getPayloadManifest(path);
        payloads.push({
          version,
          path,
          isCurrent: version === currentVersion,
          manifest,
        });
      } catch {
        // Skip directories without valid manifest
      }
    }
  }

  // Sort by version (descending)
  payloads.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  return payloads;
}

/**
 * Rollback to a previous payload version.
 */
export function rollbackPayload(version: string): void {
  const targetPath = getPayloadVersionPath(version);

  if (!existsSync(targetPath)) {
    throw new Error(`Payload version not found: v${version}`);
  }

  updateCurrentSymlink(version);
  console.log(`Rolled back to v${version}`);
}

/**
 * Check if any payload is installed.
 */
export function hasInstalledPayload(): boolean {
  const symlinkPath = getCurrentSymlinkPath();
  return existsSync(symlinkPath);
}
