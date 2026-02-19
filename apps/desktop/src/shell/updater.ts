/**
 * Package updater for managing installed packages.
 *
 * Packages are stored in ~/.kombuse/packages/ with a symlink to the current version.
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
import type { PackageManifest } from "./package-loader";
import { getPackageManifest } from "./package-loader";
import {
  getKombuseDir,
  getPackagesDir,
  getCurrentPackagePath,
  getPackageVersionPath,
} from "../paths";

// Re-export for convenience
export { getKombuseDir, getPackagesDir };

/**
 * Get the path to the "current" symlink.
 */
export function getCurrentSymlinkPath(): string {
  return getCurrentPackagePath();
}

/**
 * Ensure the packages directory exists.
 */
export function ensurePackagesDir(): void {
  const dir = getPackagesDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Install a package from a source directory.
 *
 * @param sourcePath - Path to the package directory to install
 * @returns The installed version string
 */
export function installPackage(sourcePath: string): string {
  // Read manifest to get version
  const manifest = getPackageManifest(sourcePath);
  const version = manifest.version;

  ensurePackagesDir();

  // Copy to versioned directory
  const destPath = getPackageVersionPath(version);

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
  const targetPath = getPackageVersionPath(version);

  if (!existsSync(targetPath)) {
    throw new Error(`Package version not found: v${version}`);
  }

  // Remove existing symlink if it exists
  try {
    const stat = lstatSync(symlinkPath);
    if (stat.isSymbolicLink() || stat.isFile() || stat.isDirectory()) {
      unlinkSync(symlinkPath);
    }
  } catch {
    // Symlink doesn't exist, which is fine
  }

  // Create new symlink
  symlinkSync(targetPath, symlinkPath);
  console.log(`Current package set to v${version}`);
}

/**
 * List all installed package versions.
 */
export function listPackages(): Array<{
  version: string;
  path: string;
  isCurrent: boolean;
  manifest: PackageManifest;
}> {
  const packagesDir = getPackagesDir();

  if (!existsSync(packagesDir)) {
    return [];
  }

  // Get current version
  let currentVersion: string | null = null;
  const symlinkPath = getCurrentSymlinkPath();
  if (existsSync(symlinkPath)) {
    try {
      const target = readlinkSync(symlinkPath);
      const match = target.match(/v(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?)/)
      if (match && match[1]) {
        currentVersion = match[1];
      }
    } catch {
      // Symlink doesn't exist or is broken
    }
  }

  // List version directories
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const packages: Array<{
    version: string;
    path: string;
    isCurrent: boolean;
    manifest: PackageManifest;
  }> = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("v")) {
      const version = entry.name.slice(1); // Remove 'v' prefix
      const path = join(packagesDir, entry.name);

      try {
        const manifest = getPackageManifest(path);
        packages.push({
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
  packages.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  return packages;
}

/**
 * Rollback to a previous package version.
 */
export function rollbackPackage(version: string): void {
  const targetPath = getPackageVersionPath(version);

  if (!existsSync(targetPath)) {
    throw new Error(`Package version not found: v${version}`);
  }

  updateCurrentSymlink(version);
  console.log(`Rolled back to v${version}`);
}

/**
 * Check if any package is installed.
 */
export function hasInstalledPackage(): boolean {
  const symlinkPath = getCurrentSymlinkPath();
  return existsSync(symlinkPath);
}
