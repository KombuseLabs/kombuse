/**
 * Install the built package to the user's ~/.kombuse/packages directory.
 *
 * Usage: bun run scripts/install-package.ts
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPackagesDir,
  getCurrentPackagePath,
  getPackageVersionPath,
} from "../src/paths";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGE_SRC = join(ROOT, "dist/package");

interface PackageManifest {
  version: string;
  buildTime: string;
}

function main() {
  console.log("Installing package...");

  // Check source exists
  if (!existsSync(PACKAGE_SRC)) {
    console.error(`Error: Package not found at ${PACKAGE_SRC}`);
    console.error("Run 'bun run build:package' first.");
    process.exit(1);
  }

  // Read manifest
  const manifestPath = join(PACKAGE_SRC, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: PackageManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const version = manifest.version;

  console.log(`  Source: ${PACKAGE_SRC}`);
  console.log(`  Version: ${version}`);

  // Ensure directories exist
  mkdirSync(getPackagesDir(), { recursive: true });

  // Copy to versioned directory
  const destPath = getPackageVersionPath(version);
  console.log(`  Destination: ${destPath}`);

  if (existsSync(destPath)) {
    console.log(`  Overwriting existing v${version}...`);
  }

  cpSync(PACKAGE_SRC, destPath, { recursive: true, force: true });

  // Update current symlink
  const symlinkPath = getCurrentPackagePath();

  // Remove existing symlink if it exists
  try {
    if (lstatSync(symlinkPath).isSymbolicLink() || existsSync(symlinkPath)) {
      unlinkSync(symlinkPath);
    }
  } catch {
    // Doesn't exist, that's fine
  }

  // Create new symlink
  symlinkSync(destPath, symlinkPath);

  console.log("");
  console.log(`Package v${version} installed successfully!`);
  console.log(`  Location: ${destPath}`);
  console.log(`  Symlink: ${symlinkPath} -> v${version}`);
}

main();
