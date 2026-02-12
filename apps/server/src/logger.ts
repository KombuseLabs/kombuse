import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { WriteStream } from 'node:fs'
import type { AgentEvent, KombuseSessionId } from '@kombuse/types'

type LogTarget = 'file' | 'console'
type LogLevel = 'info' | 'debug'

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

function resolveLogTarget(): LogTarget {
  return process.env.KOMBUSE_LOG_TARGET === 'console' ? 'console' : 'file'
}

function resolveLogLevel(): LogLevel {
  return process.env.KOMBUSE_LOG_LEVEL === 'debug' ? 'debug' : 'info'
}

function getLogDir(): string {
  return join(process.cwd(), 'logs')
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
      level: event.type === 'error' ? 'error' : 'info',
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
      writeLine({ ...base, ...serialized })
      return
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
