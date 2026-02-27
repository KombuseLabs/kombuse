/**
 * Package loader for dynamically loading the server bundle.
 *
 * - preview: loads from ./dist/package (bundled)
 * - prod: loads from ~/.kombuse/packages/current (installed)
 * - dev: doesn't use package (server runs externally)
 */

import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
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
 * Compare two version strings (major.minor.patch), ignoring pre-release/build metadata.
 * Returns true if version `a` is strictly less than version `b`.
 */
function isVersionLessThan(a: string, b: string): boolean {
  const pa = (a.split(/[-+]/)[0] ?? a).split(".").map(Number);
  const pb = (b.split(/[-+]/)[0] ?? b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

/**
 * Get full package info including paths to server bundle and web root.
 */
export function getPackageInfo(): PackageInfo {
  const path = getPackagePath();
  const manifest = getPackageManifest(path);

  // If installed package requires a newer shell, fall back to bundled
  if (path !== getBundledPackagePath() && manifest.minShellVersion) {
    const shellVersion = app.getVersion();
    if (isVersionLessThan(shellVersion, manifest.minShellVersion)) {
      console.warn(
        `[Package] Installed package requires shell >=${manifest.minShellVersion}, ` +
          `current shell is ${shellVersion}. Falling back to bundled package.`
      );
      const bundledPath = getBundledPackagePath();
      const bundledManifest = getPackageManifest(bundledPath);
      return {
        path: bundledPath,
        manifest: bundledManifest,
        webRoot: join(bundledPath, bundledManifest.files.web),
        serverBundle: join(bundledPath, bundledManifest.files.server),
      };
    }
  }

  return {
    path,
    manifest,
    webRoot: join(path, manifest.files.web),
    serverBundle: join(path, manifest.files.server),
  };
}

/**
 * Ensure the package directory has a node_modules symlink to the app's
 * unpacked native modules (better-sqlite3, etc.).
 *
 * Downloaded packages at ~/.kombuse/packages/ don't include node_modules,
 * but the server bundle requires better-sqlite3 at runtime. The native
 * module ships with the app in app.asar.unpacked/node_modules/.
 *
 * Runs on every startup so it self-heals if the app is relocated.
 */
function ensureNativeModulesLink(serverBundlePath: string): void {
  const packagePath = dirname(dirname(serverBundlePath));

  // Only needed for installed packages outside the app bundle.
  // Bundled packages (Resources/package/) are handled by afterPack.cjs.
  if (!app.isPackaged || packagePath.startsWith(process.resourcesPath)) return;

  const nativeModulesDir = join(process.resourcesPath, "app.asar.unpacked", "node_modules");
  if (!existsSync(nativeModulesDir)) {
    console.warn("[native] Native modules not found:", nativeModulesDir);
    return;
  }

  const nodeModulesLink = join(packagePath, "node_modules");

  // Check if symlink already exists and points to the right place
  try {
    const stat = lstatSync(nodeModulesLink);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(nodeModulesLink);
      if (target === nativeModulesDir) return;
      // Wrong target (app was moved?) — recreate
      unlinkSync(nodeModulesLink);
    } else {
      // Real directory — don't touch it, native modules may already be present
      return;
    }
  } catch {
    // Doesn't exist yet
  }

  symlinkSync(nativeModulesDir, nodeModulesLink);
  console.log(`[native] Linked: ${nodeModulesLink} -> ${nativeModulesDir}`);
}

/**
 * Dynamically load the server module from the package.
 */
export async function loadPackage(serverBundlePath: string): Promise<{
  createServer: (options: { port: number; dbPath?: string; desktop?: boolean }) => Promise<{
    listen: () => Promise<string>;
    close: () => Promise<void>;
    instance: { register: (plugin: any, opts?: any) => any };
  }>;
  setAutoUpdater: (updater: {
    getStatus(): unknown;
    checkForUpdates(): Promise<unknown>;
    downloadAndInstall(): Promise<void>;
    onStatusChange(listener: (status: unknown) => void): () => void;
  }) => void;
  setShellAutoUpdater?: (updater: {
    getStatus(): unknown;
    checkForUpdates(): Promise<unknown>;
    downloadAndInstall(): Promise<void>;
    onStatusChange(listener: (status: unknown) => void): () => void;
  }) => void;
}> {
  ensureNativeModulesLink(serverBundlePath);

  // Dynamic import of the bundled server
  const module = await import(serverBundlePath);
  return module;
}
