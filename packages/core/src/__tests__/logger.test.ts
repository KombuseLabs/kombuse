import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AgentMessageEvent,
  AgentErrorEvent,
  AgentRawEvent,
  KombuseSessionId,
} from '@kombuse/types'

const { mockWrite, mockEnd, mockUnlinkSync } = vi.hoisted(() => ({
  mockWrite: vi.fn(),
  mockEnd: vi.fn(),
  mockUnlinkSync: vi.fn(),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: vi.fn(() => '/mock-home'),
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: mockWrite,
      end: mockEnd,
    })),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
    unlinkSync: mockUnlinkSync,
  }
})

import {
  createSessionLogger,
  createAppLogger,
  closeAppLogger,
  pruneOldLogs,
  setAppLoggerOnLog,
  setLogDir,
  setLogTarget,
  getConfiguredLogDir,
  resetLogConfig,
} from '../logger'
import { existsSync, readdirSync, statSync } from 'node:fs'

const SESSION_ID = 'test-session-001' as KombuseSessionId

function makeSessionLogger(opts: { logLevel?: 'info' | 'debug'; target?: 'console' | 'file' } = {}) {
  return createSessionLogger({
    kombuseSessionId: SESSION_ID,
    getBackendSessionId: () => 'backend-123',
    target: opts.target ?? 'console',
    logLevel: opts.logLevel ?? 'info',
  })
}

function makeMessageEvent(content: string): AgentMessageEvent {
  return {
    eventId: 'evt-1',
    type: 'message',
    backend: 'claude-code',
    timestamp: Date.now(),
    role: 'assistant',
    content,
  }
}

function makeErrorEvent(msg: string): AgentErrorEvent {
  return {
    eventId: 'evt-2',
    type: 'error',
    backend: 'claude-code',
    timestamp: Date.now(),
    message: msg,
    error: new Error(msg),
  }
}

function makeRawEvent(sourceType: string, data: unknown): AgentRawEvent {
  return {
    eventId: 'evt-3',
    type: 'raw',
    backend: 'claude-code',
    timestamp: Date.now(),
    sourceType,
    data,
  }
}

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockWrite.mockClear()
  mockEnd.mockClear()
  mockUnlinkSync.mockClear()
  closeAppLogger()
  resetLogConfig()
  delete process.env.KOMBUSE_LOG_LEVEL
  delete process.env.KOMBUSE_LOG_TARGET
  delete process.env.KOMBUSE_LOG_RETENTION_DAYS
})

afterEach(() => {
  vi.restoreAllMocks()
  closeAppLogger()
  setAppLoggerOnLog(null)
})

// ---------------------------------------------------------------------------
// SessionLogger tests (migrated from apps/server/src/__tests__/logger.test.ts)
// ---------------------------------------------------------------------------

describe('SessionLogger', () => {
  describe('logEvent at debug level', () => {
    it('writes full event fields for message events', () => {
      const logger = makeSessionLogger({ logLevel: 'debug' })
      const event = makeMessageEvent('Hello world, this is a full message')

      logger.logEvent(event)

      expect(logSpy).toHaveBeenCalledOnce()
      const args = logSpy.mock.calls[0]!
      expect(args).toContain('Hello world, this is a full message')
      expect(args).toContain('assistant')
    })

    it('converts Error to plain object with name, message, stack', () => {
      const logger = makeSessionLogger({ logLevel: 'debug' })
      const event = makeErrorEvent('something broke')

      logger.logEvent(event)

      expect(errorSpy).toHaveBeenCalledOnce()
      const args = errorSpy.mock.calls[0]!
      const errorArg = args.find(
        (a: unknown) => typeof a === 'object' && a !== null && 'name' in a && 'message' in a,
      )
      expect(errorArg).toBeDefined()
      expect(errorArg).not.toBeInstanceOf(Error)
      expect(errorArg).toMatchObject({
        name: 'Error',
        message: 'something broke',
      })
      expect((errorArg as any).stack).toBeDefined()
    })

    it('falls back to slim format on serialization failure', () => {
      const logger = makeSessionLogger({ logLevel: 'debug', target: 'file' })

      const circular: Record<string, unknown> = { key: 'value' }
      circular.self = circular
      const event = makeRawEvent('cli_data', circular)

      expect(() => logger.logEvent(event)).not.toThrow()

      expect(mockWrite).toHaveBeenCalledOnce()
      const written = JSON.parse(mockWrite.mock.calls[0]![0] as string)
      expect(written.source_type).toBe('cli_data')
      expect(written.event_type).toBe('raw')
      expect(written).not.toHaveProperty('data')
    })
  })

  describe('logEvent at info level', () => {
    it('writes slim format with truncated content preview for long messages', () => {
      const logger = makeSessionLogger({ logLevel: 'info' })
      const longContent = 'x'.repeat(300)
      const event = makeMessageEvent(longContent)

      logger.logEvent(event)

      expect(logSpy).toHaveBeenCalledOnce()
      const args = logSpy.mock.calls[0]!
      const preview = args.find((a: unknown) => typeof a === 'string' && a.endsWith('...'))
      expect(preview).toBeDefined()
      expect((preview as string).length).toBe(203) // 200 + '...'
    })

    it('writes slim format for raw events with only source_type', () => {
      const logger = makeSessionLogger({ logLevel: 'info' })
      const event = makeRawEvent('cli_pre_normalization', { big: 'payload' })

      logger.logEvent(event)

      expect(logSpy).toHaveBeenCalledOnce()
      const args = logSpy.mock.calls[0]!
      expect(args).toContain('cli_pre_normalization')
      expect(args).not.toContainEqual({ big: 'payload' })
    })
  })

  describe('logLevel option', () => {
    it('option overrides environment default', () => {
      const debugLogger = makeSessionLogger({ logLevel: 'debug' })
      const infoLogger = makeSessionLogger({ logLevel: 'info' })
      const event = makeMessageEvent('test content for level override')

      debugLogger.logEvent(event)
      const debugArgs = logSpy.mock.calls[0]!

      logSpy.mockClear()

      infoLogger.logEvent(event)
      const infoArgs = logSpy.mock.calls[0]!

      expect(debugArgs).toContain('test content for level override')
      expect(debugArgs.length).toBeGreaterThan(infoArgs.length)
    })
  })
})

// ---------------------------------------------------------------------------
// AppLogger tests
// ---------------------------------------------------------------------------

describe('AppLogger', () => {
  describe('level filtering', () => {
    it('suppresses debug when level is info (default)', () => {
      const logger = createAppLogger('Test', { target: 'console', level: 'info' })

      logger.debug('should not appear')
      logger.info('should appear')

      expect(logSpy).toHaveBeenCalledOnce()
      expect(logSpy.mock.calls[0]).toContain('should appear')
    })

    it('emits all levels when level is debug', () => {
      const logger = createAppLogger('Test', { target: 'console', level: 'debug' })

      logger.debug('debug msg')
      logger.info('info msg')
      logger.warn('warn msg')
      logger.error('error msg')

      expect(logSpy).toHaveBeenCalledTimes(2) // debug + info
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(errorSpy).toHaveBeenCalledOnce()
    })

    it('suppresses debug and info when level is warn', () => {
      const logger = createAppLogger('Test', { target: 'console', level: 'warn' })

      logger.debug('no')
      logger.info('no')
      logger.warn('yes')
      logger.error('yes')

      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(errorSpy).toHaveBeenCalledOnce()
    })

    it('only emits error when level is error', () => {
      const logger = createAppLogger('Test', { target: 'console', level: 'error' })

      logger.debug('no')
      logger.info('no')
      logger.warn('no')
      logger.error('yes')

      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledOnce()
    })

    it('reads KOMBUSE_LOG_LEVEL env var', () => {
      process.env.KOMBUSE_LOG_LEVEL = 'warn'
      const logger = createAppLogger('Test', { target: 'console' })

      logger.info('suppressed')
      logger.warn('visible')

      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
    })
  })

  describe('console target', () => {
    it('prefixes with [component] and uses console.log for info', () => {
      const logger = createAppLogger('Server', { target: 'console', level: 'info' })

      logger.info('started')

      expect(logSpy).toHaveBeenCalledWith('[Server]', 'started')
    })

    it('uses console.warn for warn level', () => {
      const logger = createAppLogger('Server', { target: 'console', level: 'info' })

      logger.warn('something wrong')

      expect(warnSpy).toHaveBeenCalledWith('[Server]', 'something wrong')
    })

    it('uses console.error for error level', () => {
      const logger = createAppLogger('Server', { target: 'console', level: 'info' })

      logger.error('fatal')

      expect(errorSpy).toHaveBeenCalledWith('[Server]', 'fatal')
    })

    it('includes data object when provided', () => {
      const logger = createAppLogger('Server', { target: 'console', level: 'info' })

      logger.info('msg', { key: 'value' })

      expect(logSpy).toHaveBeenCalledWith('[Server]', 'msg', { key: 'value' })
    })

    it('omits data when not provided', () => {
      const logger = createAppLogger('Server', { target: 'console', level: 'info' })

      logger.info('msg')

      expect(logSpy).toHaveBeenCalledWith('[Server]', 'msg')
    })
  })

  describe('file target', () => {
    it('writes NDJSON with ts, level, component, msg fields', () => {
      const logger = createAppLogger('Server', { target: 'file', level: 'info' })

      logger.info('hello')

      expect(mockWrite).toHaveBeenCalledOnce()
      const written = JSON.parse(mockWrite.mock.calls[0]![0] as string)
      expect(written).toMatchObject({
        level: 'info',
        component: 'Server',
        msg: 'hello',
      })
      expect(written.ts).toBeDefined()
    })

    it('includes data field when provided', () => {
      const logger = createAppLogger('Server', { target: 'file', level: 'info' })

      logger.info('msg', { port: 3000 })

      const written = JSON.parse(mockWrite.mock.calls[0]![0] as string)
      expect(written.data).toEqual({ port: 3000 })
    })

    it('omits data field when not provided', () => {
      const logger = createAppLogger('Server', { target: 'file', level: 'info' })

      logger.info('msg')

      const written = JSON.parse(mockWrite.mock.calls[0]![0] as string)
      expect(written).not.toHaveProperty('data')
    })

    it('multiple loggers share the same stream', () => {
      const loggerA = createAppLogger('A', { target: 'file', level: 'info' })
      const loggerB = createAppLogger('B', { target: 'file', level: 'info' })

      loggerA.info('from A')
      loggerB.info('from B')

      // Both writes should go through the same mockWrite (shared stream)
      expect(mockWrite).toHaveBeenCalledTimes(2)
      const lineA = JSON.parse(mockWrite.mock.calls[0]![0] as string)
      const lineB = JSON.parse(mockWrite.mock.calls[1]![0] as string)
      expect(lineA.component).toBe('A')
      expect(lineB.component).toBe('B')
    })
  })
})

// ---------------------------------------------------------------------------
// closeAppLogger tests
// ---------------------------------------------------------------------------

describe('closeAppLogger', () => {
  it('ends the shared stream', () => {
    const logger = createAppLogger('Test', { target: 'file', level: 'info' })
    logger.info('trigger stream creation')

    closeAppLogger()

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it('is idempotent when called multiple times', () => {
    const logger = createAppLogger('Test', { target: 'file', level: 'info' })
    logger.info('trigger stream creation')

    closeAppLogger()
    closeAppLogger()

    expect(mockEnd).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// pruneOldLogs tests
// ---------------------------------------------------------------------------

describe('pruneOldLogs', () => {
  it('deletes .ndjson files older than maxAgeDays', () => {
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000 // 10 days ago
    vi.mocked(readdirSync).mockReturnValue(['old.ndjson', 'recent.ndjson'] as any)
    vi.mocked(statSync).mockImplementation((filePath) => {
      if (String(filePath).includes('old')) {
        return { mtimeMs: oldTime } as any
      }
      return { mtimeMs: Date.now() } as any
    })

    const count = pruneOldLogs({ maxAgeDays: 7, logDir: '/tmp/logs' })

    expect(count).toBe(1)
    expect(mockUnlinkSync).toHaveBeenCalledOnce()
    expect(String(mockUnlinkSync.mock.calls[0]![0])).toContain('old.ndjson')
  })

  it('preserves .ndjson files newer than maxAgeDays', () => {
    vi.mocked(readdirSync).mockReturnValue(['recent.ndjson'] as any)
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    const count = pruneOldLogs({ maxAgeDays: 7, logDir: '/tmp/logs' })

    expect(count).toBe(0)
    expect(mockUnlinkSync).not.toHaveBeenCalled()
  })

  it('ignores non-.ndjson files', () => {
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000
    vi.mocked(readdirSync).mockReturnValue(['data.txt', 'readme.md'] as any)
    vi.mocked(statSync).mockReturnValue({ mtimeMs: oldTime } as any)

    const count = pruneOldLogs({ maxAgeDays: 7, logDir: '/tmp/logs' })

    expect(count).toBe(0)
    expect(mockUnlinkSync).not.toHaveBeenCalled()
  })

  it('returns count of deleted files', () => {
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000
    vi.mocked(readdirSync).mockReturnValue(['a.ndjson', 'b.ndjson', 'c.ndjson'] as any)
    vi.mocked(statSync).mockReturnValue({ mtimeMs: oldTime } as any)

    const count = pruneOldLogs({ maxAgeDays: 7, logDir: '/tmp/logs' })

    expect(count).toBe(3)
    expect(mockUnlinkSync).toHaveBeenCalledTimes(3)
  })

  it('returns 0 when log directory does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const count = pruneOldLogs({ logDir: '/tmp/nonexistent' })

    expect(count).toBe(0)
  })

  it('defaults maxAgeDays to 7', () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    vi.mocked(readdirSync).mockReturnValue(['new.ndjson', 'old.ndjson'] as any)
    vi.mocked(statSync).mockImplementation((filePath) => {
      if (String(filePath).includes('old')) {
        return { mtimeMs: eightDaysAgo } as any
      }
      return { mtimeMs: sixDaysAgo } as any
    })

    const count = pruneOldLogs({ logDir: '/tmp/logs' })

    expect(count).toBe(1)
  })

  it('reads KOMBUSE_LOG_RETENTION_DAYS from env', () => {
    process.env.KOMBUSE_LOG_RETENTION_DAYS = '3'
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000
    vi.mocked(readdirSync).mockReturnValue(['old.ndjson'] as any)
    vi.mocked(statSync).mockReturnValue({ mtimeMs: fourDaysAgo } as any)

    const count = pruneOldLogs({ logDir: '/tmp/logs' })

    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// setAppLoggerOnLog tests
// ---------------------------------------------------------------------------

describe('setAppLoggerOnLog', () => {
  it('calls onLog for warn when target is file', () => {
    const callback = vi.fn()
    setAppLoggerOnLog(callback)
    const logger = createAppLogger('Test', { target: 'file', level: 'info' })

    logger.warn('something wrong', { key: 'val' })

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith('warn', 'Test', 'something wrong', { key: 'val' })
  })

  it('calls onLog for error when target is file', () => {
    const callback = vi.fn()
    setAppLoggerOnLog(callback)
    const logger = createAppLogger('Test', { target: 'file', level: 'info' })

    logger.error('fatal', { code: 500 })

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith('error', 'Test', 'fatal', { code: 500 })
  })

  it('does NOT call onLog for info or debug', () => {
    const callback = vi.fn()
    setAppLoggerOnLog(callback)
    const logger = createAppLogger('Test', { target: 'file', level: 'debug' })

    logger.debug('d')
    logger.info('i')

    expect(callback).not.toHaveBeenCalled()
  })

  it('does NOT call onLog when target is console', () => {
    const callback = vi.fn()
    setAppLoggerOnLog(callback)
    const logger = createAppLogger('Test', { target: 'console', level: 'info' })

    logger.warn('test')
    logger.error('test')

    expect(callback).not.toHaveBeenCalled()
  })

  it('handles null callback (clears)', () => {
    const callback = vi.fn()
    setAppLoggerOnLog(callback)
    setAppLoggerOnLog(null)
    const logger = createAppLogger('Test', { target: 'file', level: 'info' })

    logger.error('test')

    expect(callback).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Log configuration tests
// ---------------------------------------------------------------------------

describe('log configuration', () => {
  afterEach(() => {
    resetLogConfig()
  })

  it('setLogDir changes the directory used by getConfiguredLogDir', () => {
    setLogDir('/custom/log/path')
    expect(getConfiguredLogDir()).toBe('/custom/log/path')
  })

  it('getConfiguredLogDir returns homedir/.kombuse/logs by default', () => {
    const { join } = require('node:path')
    expect(getConfiguredLogDir()).toBe(join('/mock-home', '.kombuse', 'logs'))
  })

  it('setLogTarget to file makes new loggers write to file', () => {
    setLogTarget('file')
    const logger = createAppLogger('Test')

    logger.info('file mode')

    expect(mockWrite).toHaveBeenCalledOnce()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('setLogTarget to console makes new loggers use console', () => {
    setLogTarget('console')
    const logger = createAppLogger('Test')

    logger.info('console mode')

    expect(logSpy).toHaveBeenCalledOnce()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('KOMBUSE_LOG_TARGET env var takes precedence over setLogTarget', () => {
    process.env.KOMBUSE_LOG_TARGET = 'console'
    setLogTarget('file')
    const logger = createAppLogger('Test')

    logger.info('env wins')

    expect(logSpy).toHaveBeenCalledOnce()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('setLogTarget closes existing shared stream', () => {
    const logger = createAppLogger('Test', { target: 'file' })
    logger.info('create stream')

    setLogTarget('console')

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it('resetLogConfig restores defaults', () => {
    setLogDir('/custom')
    setLogTarget('console')

    resetLogConfig()

    const { join } = require('node:path')
    expect(getConfiguredLogDir()).toBe(join('/mock-home', '.kombuse', 'logs'))
  })
})
