/**
 * Payload entry point.
 * This file is bundled into the payload and dynamically loaded by the shell.
 * It re-exports the server's createServer function with a clean interface.
 */

import { createServer } from "server";
import type { ServerOptions } from "server";

export interface PayloadExports {
  createServer: typeof createServer;
}

export { createServer };
export type { ServerOptions };
