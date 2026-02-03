/**
 * Package entry point.
 * This file is bundled into the package and dynamically loaded by the shell.
 * It re-exports the server's createServer function with a clean interface.
 */

import { createServer } from "server";
import type { ServerOptions } from "server";

export interface PackageExports {
  createServer: typeof createServer;
}

export { createServer };
export type { ServerOptions };
