/**
 * Package the built payload into distributable archives.
 *
 * Creates:
 * - release/kombuse-payload-{version}.tar.gz
 * - release/kombuse-payload-{version}.tar.gz.sha256
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAYLOAD_DIR = join(ROOT, "dist/payload");
const RELEASE_DIR = join(ROOT, "release");

interface PayloadManifest {
  version: string;
  minShellVersion: string;
  buildTime: string;
  files: {
    server: string;
    web: string;
  };
}

function readManifest(): PayloadManifest {
  const manifestPath = join(PAYLOAD_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Manifest not found at ${manifestPath}. Run 'bun run build:payload' first.`
    );
  }
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

function createTarGz(version: string): string {
  const archiveName = `kombuse-payload-${version}.tar.gz`;
  const archivePath = join(RELEASE_DIR, archiveName);

  // Use tar to create the archive
  // -C changes to dist directory, then archives payload/
  execSync(`tar -czvf "${archivePath}" -C "${join(ROOT, "dist")}" payload`, {
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

function packagePayload() {
  console.log("Packaging payload...\n");

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

  console.log("Payload packaged successfully!");
  console.log(`\nRelease artifacts:`);
  console.log(`  - kombuse-payload-${manifest.version}.tar.gz`);
  console.log(`  - kombuse-payload-${manifest.version}.tar.gz.sha256`);
}

try {
  packagePayload();
} catch (err) {
  console.error("Packaging failed:", err);
  process.exit(1);
}
