/**
 * Package loader for dynamically loading the server bundle.
 *
 * - preview: loads from ./dist/package (bundled)
 * - prod: loads from ~/.kombuse/packages/current (installed)
 * - dev: doesn't use package (server runs externally)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getCurrentPackagePath } from "../paths";
import { is } from "../env";

export interface PackageManifest {
  version: string;
  minShellVersion: string;
  buildTime: string;
  files: {
    server: string;
    web: string;
  };
}

export interface PackageInfo {
  path: string;
  manifest: PackageManifest;
  webRoot: string;
  serverBundle: string;
}

/**
 * Get the path to the bundled package (inside the app).
 *
 * - Packaged app: Resources/package (via extraResources)
 * - Development: ./dist/package
 */
export function getBundledPackagePath(): string {
  if (app.isPackaged) {
    // In packaged app, package is in Resources/package via extraResources
    return join(process.resourcesPath, "package");
  }
  // Dev/preview mode: use local dist
  return join(app.getAppPath(), "dist/package");
}

/**
 * Get the path to the installed package (~/.kombuse/packages/current).
 */
export function getInstalledPackagePath(): string {
  return getCurrentPackagePath();
}

/**
 * Get the path to the active package directory.
 *
 * - dev: Throws error (package not used, server runs externally)
 * - preview: Uses bundled package (./dist/package)
 * - prod: Uses installed package with bundled fallback
 */
export function getPackagePath(): string {
  if (is.dev()) {
    throw new Error("Package not used in dev mode - server runs externally");
  }

  if (is.preview()) {
    // Preview mode: always use local bundled package
    return getBundledPackagePath();
  }

  // Prod mode: prefer installed package
  const installedPath = getInstalledPackagePath();
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // First run: fall back to bundled package
  const bundledPath = getBundledPackagePath();
  if (existsSync(bundledPath)) {
    console.log("No installed package found, using bundled package");
    return bundledPath;
  }

  throw new Error("No package found. Run 'bun run install-package' to install.");
}

/**
 * Read and parse the package manifest.
 */
export function getPackageManifest(packagePath: string): PackageManifest {
  const manifestPath = join(packagePath, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`Package manifest not found: ${manifestPath}`);
  }

  const content = readFileSync(manifestPath, "utf-8");
  return JSON.parse(content) as PackageManifest;
}

/**
 * Get full package info including paths to server bundle and web root.
 */
export function getPackageInfo(): PackageInfo {
  const path = getPackagePath();
  const manifest = getPackageManifest(path);

  return {
    path,
    manifest,
    webRoot: join(path, manifest.files.web),
    serverBundle: join(path, manifest.files.server),
  };
}

/**
 * Dynamically load the server module from the package.
 */
export async function loadPackage(serverBundlePath: string): Promise<{
  createServer: (options: { port: number; db: unknown }) => Promise<{
    listen: () => Promise<void>;
    close: () => Promise<void>;
  }>;
  setAutoUpdater: (updater: {
    getStatus(): unknown;
    checkForUpdates(): Promise<unknown>;
    downloadAndInstall(): Promise<void>;
    onStatusChange(listener: (status: unknown) => void): () => void;
  }) => void;
}> {
  // Dynamic import of the bundled server
  const module = await import(serverBundlePath);
  return module;
}
