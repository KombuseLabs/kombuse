/**
 * Build script for creating the payload bundle.
 *
 * This script:
 * 1. Bundles payload-entry.ts with esbuild
 * 2. Copies the web dist to the payload directory
 * 3. Generates a manifest.json with version and build info
 */

import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist/payload");
const WEB_SRC = join(ROOT, "../web/dist");

async function buildPayload() {
  console.log("Building payload...");

  // Clean previous build
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  mkdirSync(join(DIST, "server"), { recursive: true });

  // 1. Bundle server entry point
  console.log("Bundling server...");
  await build({
    entryPoints: [join(ROOT, "src/payload-entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron", "better-sqlite3"],
    outfile: join(DIST, "server/bundle.mjs"),
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });

  // 2. Copy web dist
  console.log("Copying web assets...");
  cpSync(WEB_SRC, join(DIST, "web"), { recursive: true });

  // 3. Generate manifest
  console.log("Generating manifest...");
  const pkg = await import(join(ROOT, "package.json"), {
    with: { type: "json" },
  });

  const manifest = {
    version: pkg.default.version,
    minShellVersion: "1.0.0",
    buildTime: new Date().toISOString(),
    files: {
      server: "server/bundle.mjs",
      web: "web/",
    },
  };

  writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log("Payload built successfully!");
  console.log(`  Version: ${manifest.version}`);
  console.log(`  Output: ${DIST}`);
}

buildPayload().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
