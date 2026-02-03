/**
 * Environment mode detection for the desktop app.
 *
 * Modes:
 * - dev: Hot reload development (web from Vite, embedded server)
 * - preview: Test built payload locally (embedded server, local payload)
 * - prod: Production with updater (embedded server, installed payloads)
 */

import { app } from "electron";

export type AppMode = "dev" | "preview" | "prod";

/**
 * Get the current application mode.
 *
 * Detection logic:
 * - KOMBUSE_MODE env var takes precedence
 * - If packaged app, default to prod
 * - If unpackaged, default to preview (was dev behavior before)
 */
export function getMode(): AppMode {
  const envMode = process.env.KOMBUSE_MODE;

  if (envMode === "dev" || envMode === "preview" || envMode === "prod") {
    return envMode;
  }

  // Packaged apps default to prod
  if (app.isPackaged) {
    return "prod";
  }

  // Unpackaged defaults to preview (load local payload)
  return "preview";
}

/**
 * Environment mode helpers.
 *
 * Usage:
 *   import { is } from '../env';
 *   if (is.dev()) { ... }
 */
export const is = {
  /** Dev mode: web from Vite, embedded server */
  dev: () => getMode() === "dev",

  /** Preview mode: test local payload, embedded server */
  preview: () => getMode() === "preview",

  /** Prod mode: installed payloads, embedded server */
  prod: () => getMode() === "prod",
};
