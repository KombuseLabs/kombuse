/**
 * Build script for the Electron shell (main process + preload + MCP bridge).
 *
 * Replaces the inline esbuild CLI calls in package.json so we can use
 * the Sentry esbuild plugin for source-map uploads.
 */

import { build } from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const sentryPlugins = process.env.SENTRY_AUTH_TOKEN
  ? [
      sentryEsbuildPlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG ?? "philipplgh",
        project: process.env.SENTRY_PROJECT ?? "electron",
      }),
    ]
  : [];

async function buildShell() {
  // 1. MCP bridge
  console.log("Building MCP bridge...");
  await build({
    entryPoints: [join(ROOT, "../server/src/mcp-bridge.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: join(ROOT, "dist/shell/mcp-bridge.mjs"),
  });

  // 2. Main process
  console.log("Building main process...");
  await build({
    entryPoints: [join(ROOT, "src/shell/main.ts")],
    bundle: true,
    sourcemap: true,
    platform: "node",
    format: "esm",
    external: ["electron", "better-sqlite3", "electron-updater"],
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
    outfile: join(ROOT, "dist/shell/main.mjs"),
    logOverride: { "import-is-undefined": "silent" },
    plugins: [...sentryPlugins],
  });

  // 3. Preload script
  console.log("Building preload...");
  await build({
    entryPoints: [join(ROOT, "src/shell/preload.ts")],
    bundle: true,
    sourcemap: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: join(ROOT, "dist/shell/preload.cjs"),
    logOverride: { "import-is-undefined": "silent" },
    plugins: [...sentryPlugins],
  });

  console.log("Shell build complete.");
}

buildShell().catch((err) => {
  console.error("Shell build failed:", err);
  process.exit(1);
});
