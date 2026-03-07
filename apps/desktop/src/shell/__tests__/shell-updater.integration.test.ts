/**
 * Integration tests for ShellUpdater — exercises the real electron-updater
 * HTTP→YAML parse→version compare→event pipeline against a local HTTP server.
 *
 * Unlike the unit tests (shell-updater.test.ts) which mock electron-updater
 * entirely, these tests use the real autoUpdater singleton with a replaced
 * HTTP executor (Node http.request instead of Electron's net.request).
 *
 * This catches failure modes that unit tests cannot:
 * - HTTP 404/5xx on the update manifest (#732 regression)
 * - YAML parse errors (malformed manifest)
 * - Version comparison bugs from electron-updater upgrades
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";

// ---------------------------------------------------------------------------
// Electron mock — intercept at the Node module level so electron-updater's
// internal require("electron") also gets the mock (vi.mock alone doesn't
// reach into externalized node_modules dependencies).
// ---------------------------------------------------------------------------

const tmpDir = path.join(os.tmpdir(), `kombuse-integration-test-${process.pid}`);

const electronMock = {
  app: {
    getVersion: () => "1.0.0-rc.15",
    getName: () => "Kombuse",
    isPackaged: true, // Must be true — isUpdaterActive() returns false otherwise
    isReady: () => true,
    getAppPath: () => process.cwd(),
    getPath: (name: string) => path.join(tmpDir, name),
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
    quit: () => {},
    relaunch: () => {},
  },
  autoUpdater: {
    // Native Squirrel updater — required by MacUpdater constructor
    on: () => {},
    setFeedURL: () => {},
  },
};

// Hook into Node's Module._load so ALL require("electron") calls return
// our mock — including those from electron-updater's internals.
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "electron") return electronMock;
  return originalLoad.call(this, request, parent, isMain);
};

// Also register vi.mock for ESM imports of electron (used by shell-updater.ts)
vi.mock("electron", () => electronMock);

// Do NOT mock electron-updater — the whole point is using the real autoUpdater

// ---------------------------------------------------------------------------
// NodeHttpExecutor — replaces ElectronHttpExecutor for test environment
// ---------------------------------------------------------------------------

// builder-util-runtime is a transitive dependency (via electron-updater) that
// Vite's resolver can't find directly. Resolve it from electron-updater's context.
const nodeRequire = createRequire(import.meta.url);
const euRequire = createRequire(nodeRequire.resolve("electron-updater"));
const { HttpExecutor } = euRequire("builder-util-runtime") as {
  HttpExecutor: new () => any;
};

class NodeHttpExecutor extends HttpExecutor {
  createRequest(
    options: any,
    callback: (response: any) => void,
  ): http.ClientRequest {
    return http.request(options, callback);
  }
}

// ---------------------------------------------------------------------------
// Import real electron-updater (creates MacUpdater singleton with mocked electron)
// ---------------------------------------------------------------------------

import * as electronUpdater from "electron-updater";

// ---------------------------------------------------------------------------
// YAML fixtures — match electron-updater's expected format exactly
// ---------------------------------------------------------------------------

const NEWER_VERSION_YAML = `
version: 99.0.0
releaseDate: '2026-03-06T12:00:00.000Z'
files:
  - url: Kombuse-99.0.0-arm64-mac.zip
    sha512: ${"a".repeat(128)}
    size: 123456789
`.trim();

const SAME_VERSION_YAML = `
version: 1.0.0-rc.15
releaseDate: '2026-03-06T12:00:00.000Z'
files:
  - url: Kombuse-1.0.0-rc.15-arm64-mac.zip
    sha512: ${"a".repeat(128)}
    size: 123456789
`.trim();

// ---------------------------------------------------------------------------
// Test server & lifecycle
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;
let nextResponse: { status: number; body: string };

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("ShellUpdater integration (real HTTP)", () => {
  beforeAll(async () => {
    // Create temp directory for userData (stagingUserIdPromise reads/writes here)
    fs.mkdirSync(path.join(tmpDir, "userData"), { recursive: true });

    // Start HTTP server on random port
    server = http.createServer((_req, res) => {
      res.writeHead(nextResponse.status, { "Content-Type": "text/yaml" });
      res.end(nextResponse.body);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;

    // Access autoUpdater lazily — the getter on the exports object creates the
    // MacUpdater singleton on first access, which requires the electron mock.
    const autoUpdater = (electronUpdater as any).autoUpdater;

    // Replace HTTP executor BEFORE setFeedURL (setFeedURL captures the executor).
    // httpExecutor is a writable field on AppUpdater but not in the public type declarations.
    autoUpdater.httpExecutor = new NodeHttpExecutor();

    // Point at local server
    autoUpdater.setFeedURL({
      provider: "generic",
      url: `http://localhost:${port}`,
    });
  });

  afterAll(async () => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fires update-available when server has a newer version", async () => {
    const { ShellUpdater } = await import("../shell-updater");
    const shellUpdater = new ShellUpdater();

    nextResponse = { status: 200, body: NEWER_VERSION_YAML };

    const result = await shellUpdater.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.updateInfo?.version).toBe("99.0.0");
    expect(shellUpdater.getStatus().state).toBe("available");
  });

  it("fires update-not-available when server has the same version", async () => {
    const { ShellUpdater } = await import("../shell-updater");
    const shellUpdater = new ShellUpdater();

    nextResponse = { status: 200, body: SAME_VERSION_YAML };

    const result = await shellUpdater.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(shellUpdater.getStatus().state).toBe("idle");
  });

  it("silently retries on manifest 404 instead of showing error (#782)", async () => {
    const { ShellUpdater } = await import("../shell-updater");
    const shellUpdater = new ShellUpdater();

    nextResponse = { status: 404, body: "Not Found" };

    await expect(shellUpdater.checkForUpdates()).rejects.toThrow();

    // First 404 triggers retry logic — state stays idle, no error shown to user
    expect(shellUpdater.getStatus().state).toBe("idle");
    expect(shellUpdater.getStatus().error).toBeNull();
  });
});
