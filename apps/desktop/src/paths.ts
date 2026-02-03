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
 * Get the directory containing all installed payloads.
 */
export function getPayloadsDir(): string {
  return join(getKombuseDir(), "payloads");
}

/**
 * Get the path to the "current" payload symlink.
 */
export function getCurrentPayloadPath(): string {
  return join(getPayloadsDir(), "current");
}

/**
 * Get the path to a specific payload version.
 */
export function getPayloadVersionPath(version: string): string {
  return join(getPayloadsDir(), `v${version}`);
}
