/**
 * Build script for creating the package bundle.
 *
 * This script:
 * 1. Bundles package-entry.ts with esbuild
 * 2. Copies the web dist to the package directory
 * 3. Generates a manifest.json with version and build info
 */

import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist/package");
const WEB_SRC = join(ROOT, "../web/dist");

async function buildPackage() {
  console.log("Building package...");

  // Clean previous build
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  mkdirSync(join(DIST, "server"), { recursive: true });

  // 1. Bundle server entry point
  console.log("Bundling server...");
  await build({
    entryPoints: [join(ROOT, "src/package-entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron", "better-sqlite3"],
    outfile: join(DIST, "server/bundle.mjs"),
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });

  // 1b. Bundle MCP stdio bridge (pure JS, no native modules)
  console.log("Bundling MCP bridge...");
  await build({
    entryPoints: [join(ROOT, "../server/src/mcp-bridge.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: join(DIST, "server/mcp-bridge.mjs"),
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
      mcpBridge: "server/mcp-bridge.mjs",
      web: "web/",
    },
  };

  writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log("Package built successfully!");
  console.log(`  Version: ${manifest.version}`);
  console.log(`  Output: ${DIST}`);
}

buildPackage().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
