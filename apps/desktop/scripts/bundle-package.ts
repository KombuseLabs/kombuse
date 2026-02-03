/**
 * Package the built package into distributable archives.
 *
 * Creates:
 * - release/kombuse-package-{version}.tar.gz
 * - release/kombuse-package-{version}.tar.gz.sha256
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGE_DIR = join(ROOT, "dist/package");
const RELEASE_DIR = join(ROOT, "release");

interface PackageManifest {
  version: string;
  minShellVersion: string;
  buildTime: string;
  files: {
    server: string;
    web: string;
  };
}

function readManifest(): PackageManifest {
  const manifestPath = join(PACKAGE_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Manifest not found at ${manifestPath}. Run 'bun run build:package' first.`
    );
  }
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

function createTarGz(version: string): string {
  const archiveName = `kombuse-package-${version}.tar.gz`;
  const archivePath = join(RELEASE_DIR, archiveName);

  // Use tar to create the archive
  // -C changes to dist directory, then archives package/
  execSync(`tar -czvf "${archivePath}" -C "${join(ROOT, "dist")}" package`, {
    stdio: "inherit",
  });

  return archivePath;
}

function createChecksum(filePath: string): void {
  const content = readFileSync(filePath);
  const hash = createHash("sha256").update(content).digest("hex");
  const checksumPath = `${filePath}.sha256`;
  const fileName = filePath.split("/").pop();

  // Format: hash  filename (two spaces, matching sha256sum output)
  const checksumContent = `${hash}  ${fileName}\n`;
  writeFileSync(checksumPath, checksumContent);
  console.log(`Checksum: ${hash}`);
}

function bundlePackage() {
  console.log("Bundling package for release...\n");

  // Read manifest for version
  const manifest = readManifest();
  console.log(`Version: ${manifest.version}`);
  console.log(`Min Shell Version: ${manifest.minShellVersion}`);
  console.log(`Build Time: ${manifest.buildTime}\n`);

  // Ensure release directory exists
  mkdirSync(RELEASE_DIR, { recursive: true });

  // Create tar.gz archive
  console.log("Creating tar.gz archive...");
  const archivePath = createTarGz(manifest.version);
  console.log(`Created: ${archivePath}\n`);

  // Create checksum
  console.log("Generating SHA256 checksum...");
  createChecksum(archivePath);
  console.log(`Created: ${archivePath}.sha256\n`);

  console.log("Package bundled successfully!");
  console.log(`\nRelease artifacts:`);
  console.log(`  - kombuse-package-${manifest.version}.tar.gz`);
  console.log(`  - kombuse-package-${manifest.version}.tar.gz.sha256`);
}

try {
  bundlePackage();
} catch (err) {
  console.error("Bundling failed:", err);
  process.exit(1);
}
