/* eslint-disable no-console */

// ---------------------------------------------------------------------------
// Browser-compatible logger — same AppLogger interface, console-only output.
// Types are duplicated (not imported from ./logger) to avoid bundlers
// pulling in node:fs via the logger module.
// ---------------------------------------------------------------------------

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppLogger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export type AppLogCallback = (
  level: 'warn' | 'error',
  component: string,
  message: string,
  data?: Record<string, unknown>,
) => void

let _globalOnLog: AppLogCallback | null = null

export function setBrowserLoggerOnLog(callback: AppLogCallback | null): void {
  _globalOnLog = callback
}

export function createBrowserLogger(component: string): AppLogger {
  function log(
    level: AppLogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const fn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log
    if (data) {
      fn(`[${component}]`, message, data)
    } else {
      fn(`[${component}]`, message)
    }

    if (
      _globalOnLog &&
      (level === 'warn' || level === 'error')
    ) {
      _globalOnLog(level, component, message, data)
    }
  }

  return {
    debug: (message, data?) => log('debug', message, data),
    info: (message, data?) => log('info', message, data),
    warn: (message, data?) => log('warn', message, data),
    error: (message, data?) => log('error', message, data),
  }
}
