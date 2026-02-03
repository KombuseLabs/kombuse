/**
 * Shared path utilities for Kombuse desktop app.
 * No electron dependency - can be used in scripts and shell.
 */

import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Get the base directory for all Kombuse data (~/.kombuse).
 */
export function getKombuseDir(): string {
  return join(homedir(), ".kombuse");
}

/**
 * Get the directory containing all installed packages.
 */
export function getPackagesDir(): string {
  return join(getKombuseDir(), "packages");
}

/**
 * Get the path to the "current" package symlink.
 */
export function getCurrentPackagePath(): string {
  return join(getPackagesDir(), "current");
}

/**
 * Get the path to a specific package version.
 */
export function getPackageVersionPath(version: string): string {
  return join(getPackagesDir(), `v${version}`);
}
