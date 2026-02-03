/**
 * Install the built payload to the user's ~/.kombuse/payloads directory.
 *
 * Usage: bun run scripts/install-payload.ts
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
  getPayloadsDir,
  getCurrentPayloadPath,
  getPayloadVersionPath,
} from "../src/paths";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAYLOAD_SRC = join(ROOT, "dist/payload");

interface PayloadManifest {
  version: string;
  buildTime: string;
}

function main() {
  console.log("Installing payload...");

  // Check source exists
  if (!existsSync(PAYLOAD_SRC)) {
    console.error(`Error: Payload not found at ${PAYLOAD_SRC}`);
    console.error("Run 'bun run build:payload' first.");
    process.exit(1);
  }

  // Read manifest
  const manifestPath = join(PAYLOAD_SRC, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: PayloadManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const version = manifest.version;

  console.log(`  Source: ${PAYLOAD_SRC}`);
  console.log(`  Version: ${version}`);

  // Ensure directories exist
  mkdirSync(getPayloadsDir(), { recursive: true });

  // Copy to versioned directory
  const destPath = getPayloadVersionPath(version);
  console.log(`  Destination: ${destPath}`);

  if (existsSync(destPath)) {
    console.log(`  Overwriting existing v${version}...`);
  }

  cpSync(PAYLOAD_SRC, destPath, { recursive: true, force: true });

  // Update current symlink
  const symlinkPath = getCurrentPayloadPath();

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
  console.log(`✓ Payload v${version} installed successfully!`);
  console.log(`  Location: ${destPath}`);
  console.log(`  Symlink: ${symlinkPath} -> v${version}`);
}

main();
