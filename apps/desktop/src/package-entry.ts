/**
 * Package entry point.
 * This file is bundled into the package and dynamically loaded by the shell.
 * It re-exports the server's createServer function with a clean interface.
 */

import { createServer, setAutoUpdater, setShellAutoUpdater } from "server";
import type { ServerOptions, AutoUpdaterInterface } from "server";

export interface PackageExports {
  createServer: typeof createServer;
  setAutoUpdater: typeof setAutoUpdater;
  setShellAutoUpdater: typeof setShellAutoUpdater;
}

export { createServer, setAutoUpdater, setShellAutoUpdater };
export type { ServerOptions, AutoUpdaterInterface };
