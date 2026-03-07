/* eslint-disable no-console */
import {
  mkdirSync,
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { WriteStream } from 'node:fs'
import type { AgentEvent, KombuseSessionId } from '@kombuse/types'

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

export type LogTarget = 'file' | 'console'
export type LogLevel = 'info' | 'debug'
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error'

let _configuredLogDir: string | null = null
let _configuredLogTarget: LogTarget | null = null

export function setLogDir(dir: string): void {
  _configuredLogDir = dir
}

export function getConfiguredLogDir(): string {
  return _configuredLogDir ?? process.env.KOMBUSE_LOG_DIR ?? join(homedir(), '.kombuse', 'logs')
}

export function setLogTarget(target: LogTarget): void {
  _configuredLogTarget = target
  closeAppLogger()
}

export function resetLogConfig(): void {
  _configuredLogDir = null
  _configuredLogTarget = null
}

function resolveLogTarget(): LogTarget {
  if (process.env.KOMBUSE_LOG_TARGET === 'console') return 'console'
  if (process.env.KOMBUSE_LOG_TARGET === 'file') return 'file'
  if (_configuredLogTarget) return _configuredLogTarget
  return 'file'
}

function resolveLogLevel(): LogLevel {
  return process.env.KOMBUSE_LOG_LEVEL === 'debug' ? 'debug' : 'info'
}

function resolveAppLogLevel(): AppLogLevel {
  const env = process.env.KOMBUSE_LOG_LEVEL
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env
  }
  return 'info'
}

function getLogDir(): string {
  return _configuredLogDir ?? process.env.KOMBUSE_LOG_DIR ?? join(homedir(), '.kombuse', 'logs')
}

// ---------------------------------------------------------------------------
// SessionLogger (moved from apps/server/src/logger.ts)
// ---------------------------------------------------------------------------

export interface SessionLoggerOptions {
  kombuseSessionId: KombuseSessionId
  /** Resolved lazily at first write — the backend session ID may not be available yet */
  getBackendSessionId: () => string | undefined
  target?: LogTarget
  /** Log level: 'info' (default) keeps slim per-type format, 'debug' writes full event objects */
  logLevel?: LogLevel
}

export interface SessionLogger {
  logEvent(event: AgentEvent): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
  close(): void
}

export function createSessionLogger(options: SessionLoggerOptions): SessionLogger {
  const target = options.target ?? resolveLogTarget()
  const logLevel = options.logLevel ?? resolveLogLevel()
  let stream: WriteStream | null = null

  function ensureStream(): WriteStream {
    if (stream) return stream

    const logDir = getLogDir()
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    const backendId = options.getBackendSessionId()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const parts = [timestamp, options.kombuseSessionId]
    if (backendId) {
      parts.push(backendId)
    }
    const filename = parts.join('_') + '.ndjson'

    stream = createWriteStream(join(logDir, filename), { flags: 'a' })
    return stream
  }

  function writeLine(entry: Record<string, unknown>): void {
    if (target === 'console') {
      const { level, ...rest } = entry
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      fn(`[Server]`, ...Object.values(rest))
      return
    }
    ensureStream().write(JSON.stringify(entry) + '\n')
  }

  function logEvent(event: AgentEvent): void {
    const base = {
      ts: new Date().toISOString(),
      level: event.type === 'error' ? 'error' : event.type === 'raw' ? 'debug' : 'info',
      session: options.kombuseSessionId,
      event_type: event.type,
    }

    if (logLevel === 'debug') {
      const serialized = { ...event } as Record<string, unknown>
      if ('error' in serialized && serialized.error instanceof Error) {
        serialized.error = {
          name: serialized.error.name,
          message: serialized.error.message,
          stack: serialized.error.stack,
        }
      }
      try {
        writeLine({ ...base, ...serialized })
        return
      } catch {
        // Fall through to slim format if serialization fails (e.g. circular refs)
      }
    }

    let entry: Record<string, unknown>

    switch (event.type) {
      case 'raw':
        if ((event.data as any)?.type === 'system') {
          entry = { ...base, system_content: (event.data as any).content }
        } else {
          entry = { ...base, source_type: event.sourceType }
        }
        break
      case 'message':
        entry = {
          ...base,
          role: event.role,
          content_preview:
            event.content.length > 200
              ? event.content.slice(0, 200) + '...'
              : event.content,
        }
        break
      case 'error':
        entry = {
          ...base,
          message: event.message,
          stack: event.error?.stack,
        }
        break
      case 'permission_request':
        entry = {
          ...base,
          tool_name: event.toolName,
          input: event.input,
        }
        break
      case 'tool_use':
        entry = {
          ...base,
          tool_name: event.name,
        }
        break
      default:
        entry = { ...base, data: event }
        break
    }

    writeLine(entry)
  }

  function info(message: string, data?: unknown): void {
    writeLine({
      ts: new Date().toISOString(),
      level: 'info',
      session: options.kombuseSessionId,
      msg: message,
      ...(data != null ? { data } : {}),
    })
  }

  function warn(message: string, data?: unknown): void {
    writeLine({
      ts: new Date().toISOString(),
      level: 'warn',
      session: options.kombuseSessionId,
      msg: message,
      ...(data != null ? { data } : {}),
    })
  }

  function error(message: string, data?: unknown): void {
    writeLine({
      ts: new Date().toISOString(),
      level: 'error',
      session: options.kombuseSessionId,
      msg: message,
      ...(data != null ? { data } : {}),
    })
  }

  function close(): void {
    if (stream) {
      stream.end()
      stream = null
    }
  }

  return { logEvent, info, warn, error, close }
}

// ---------------------------------------------------------------------------
// AppLogger
// ---------------------------------------------------------------------------

export interface AppLogger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export interface AppLoggerOptions {
  target?: LogTarget
  level?: AppLogLevel
}

export type AppLogCallback = (
  level: 'warn' | 'error',
  component: string,
  message: string,
  data?: Record<string, unknown>,
) => void

let _globalOnLog: AppLogCallback | null = null

export function setAppLoggerOnLog(callback: AppLogCallback | null): void {
  _globalOnLog = callback
}

const APP_LOG_LEVEL_PRIORITY: Record<AppLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let sharedAppStream: WriteStream | null = null

function ensureAppStream(): WriteStream {
  if (sharedAppStream) return sharedAppStream

  const logDir = getLogDir()
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `app_${timestamp}.ndjson`
  sharedAppStream = createWriteStream(join(logDir, filename), { flags: 'a' })
  return sharedAppStream
}

/**
 * @remarks **Not safe for Electron preloads or browser contexts** — this module
 * imports `node:fs`, `node:os`, and `node:path` at the top level. Use
 * {@link createBrowserLogger} from `@kombuse/core/browser-logger` instead.
 */
export function createAppLogger(
  component: string,
  options?: AppLoggerOptions,
): AppLogger {
  const target = options?.target ?? resolveLogTarget()
  const minLevel = options?.level ?? resolveAppLogLevel()
  const minPriority = APP_LOG_LEVEL_PRIORITY[minLevel]

  function shouldLog(level: AppLogLevel): boolean {
    return APP_LOG_LEVEL_PRIORITY[level] >= minPriority
  }

  function log(
    level: AppLogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (!shouldLog(level)) return

    if (target === 'console') {
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
    } else {
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        component,
        msg: message,
      }
      if (data) {
        entry.data = data
      }
      ensureAppStream().write(JSON.stringify(entry) + '\n')
    }

    // Forward warn/error to global callback (e.g., Sentry) only for non-console
    // targets — console targets are already covered by captureConsoleIntegration.
    if (_globalOnLog && target !== 'console' && (level === 'warn' || level === 'error')) {
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

export function closeAppLogger(): void {
  if (sharedAppStream) {
    sharedAppStream.end()
    sharedAppStream = null
  }
}

// ---------------------------------------------------------------------------
// Log retention
// ---------------------------------------------------------------------------

export interface PruneOptions {
  maxAgeDays?: number
  logDir?: string
}

export function pruneOldLogs(options?: PruneOptions): number {
  const maxAgeDays =
    options?.maxAgeDays ??
    (process.env.KOMBUSE_LOG_RETENTION_DAYS
      ? parseInt(process.env.KOMBUSE_LOG_RETENTION_DAYS, 10)
      : 7)
  const logDir = options?.logDir ?? getLogDir()

  if (!existsSync(logDir)) return 0

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let pruned = 0

  const entries = readdirSync(logDir)
  for (const entry of entries) {
    if (!entry.endsWith('.ndjson')) continue
    const filePath = join(logDir, entry)
    try {
      const stat = statSync(filePath)
      if (stat.mtimeMs < cutoff) {
        unlinkSync(filePath)
        pruned++
      }
    } catch {
      // Skip files we can't stat/delete
    }
  }

  return pruned
}
