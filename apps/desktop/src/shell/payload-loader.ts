/**
 * Payload loader for dynamically loading the server bundle.
 *
 * - preview: loads from ./dist/payload (bundled)
 * - prod: loads from ~/.kombuse/payloads/current (installed)
 * - dev: doesn't use payload (server runs externally)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getCurrentPayloadPath } from "../paths";
import { is } from "../env";

export interface PayloadManifest {
  version: string;
  buildTime: string;
  files: {
    server: string;
    web: string;
  };
}

export interface PayloadInfo {
  path: string;
  manifest: PayloadManifest;
  webRoot: string;
  serverBundle: string;
}

/**
 * Get the path to the bundled payload (inside the app).
 */
export function getBundledPayloadPath(): string {
  return join(app.getAppPath(), "dist/payload");
}

/**
 * Get the path to the installed payload (~/.kombuse/payloads/current).
 */
export function getInstalledPayloadPath(): string {
  return getCurrentPayloadPath();
}

/**
 * Get the path to the active payload directory.
 *
 * - dev: Throws error (payload not used, server runs externally)
 * - preview: Uses bundled payload (./dist/payload)
 * - prod: Uses installed payload with bundled fallback
 */
export function getPayloadPath(): string {
  if (is.dev()) {
    throw new Error("Payload not used in dev mode - server runs externally");
  }

  if (is.preview()) {
    // Preview mode: always use local bundled payload
    return getBundledPayloadPath();
  }

  // Prod mode: prefer installed payload
  const installedPath = getInstalledPayloadPath();
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // First run: fall back to bundled payload
  const bundledPath = getBundledPayloadPath();
  if (existsSync(bundledPath)) {
    console.log("No installed payload found, using bundled payload");
    return bundledPath;
  }

  throw new Error("No payload found. Run 'bun run install-payload' to install.");
}

/**
 * Read and parse the payload manifest.
 */
export function getPayloadManifest(payloadPath: string): PayloadManifest {
  const manifestPath = join(payloadPath, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`Payload manifest not found: ${manifestPath}`);
  }

  const content = readFileSync(manifestPath, "utf-8");
  return JSON.parse(content) as PayloadManifest;
}

/**
 * Get full payload info including paths to server bundle and web root.
 */
export function getPayloadInfo(): PayloadInfo {
  const path = getPayloadPath();
  const manifest = getPayloadManifest(path);

  return {
    path,
    manifest,
    webRoot: join(path, manifest.files.web),
    serverBundle: join(path, manifest.files.server),
  };
}

/**
 * Dynamically load the server module from the payload.
 */
export async function loadPayload(serverBundlePath: string): Promise<{
  createServer: (options: { port: number; db: unknown }) => Promise<{
    listen: () => Promise<void>;
    close: () => Promise<void>;
  }>;
}> {
  // Dynamic import of the bundled server
  const module = await import(serverBundlePath);
  return module;
}
