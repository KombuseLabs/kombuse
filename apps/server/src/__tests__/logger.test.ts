import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AgentMessageEvent,
  AgentErrorEvent,
  AgentRawEvent,
  KombuseSessionId,
} from '@kombuse/types'

const mockWrite = vi.fn()

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: mockWrite,
      end: vi.fn(),
    })),
  }
})

import { createSessionLogger } from '../logger'

const SESSION_ID = 'test-session-001' as KombuseSessionId

function makeLogger(opts: { logLevel?: 'info' | 'debug'; target?: 'console' | 'file' } = {}) {
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
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockWrite.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logEvent at debug level', () => {
  it('writes full event fields for message events', () => {
    const logger = makeLogger({ logLevel: 'debug' })
    const event = makeMessageEvent('Hello world, this is a full message')

    logger.logEvent(event)

    expect(logSpy).toHaveBeenCalledOnce()
    const args = logSpy.mock.calls[0]!
    // In console mode, writeLine spreads Object.values(rest) after '[Server]'
    // The merged object includes all event fields — content should appear in full
    expect(args).toContain('Hello world, this is a full message')
    expect(args).toContain('assistant')
  })

  it('converts Error to plain object with name, message, stack', () => {
    const logger = makeLogger({ logLevel: 'debug' })
    const event = makeErrorEvent('something broke')

    logger.logEvent(event)

    // Error events use console.error because level is 'error'
    expect(errorSpy).toHaveBeenCalledOnce()
    const args = errorSpy.mock.calls[0]!
    // The error field should be serialized as a plain object, not an Error instance
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
    const logger = makeLogger({ logLevel: 'debug', target: 'file' })

    // Create event with circular reference in data
    const circular: Record<string, unknown> = { key: 'value' }
    circular.self = circular
    const event = makeRawEvent('cli_data', circular)

    // Should not throw
    expect(() => logger.logEvent(event)).not.toThrow()

    // mockWrite should be called once — with the slim fallback format
    expect(mockWrite).toHaveBeenCalledOnce()
    const written = JSON.parse(mockWrite.mock.calls[0]![0] as string)
    // Slim format for raw events has source_type, not the full data
    expect(written.source_type).toBe('cli_data')
    expect(written.event_type).toBe('raw')
    expect(written).not.toHaveProperty('data')
  })
})

describe('logEvent at info level', () => {
  it('writes slim format with truncated content preview for long messages', () => {
    const logger = makeLogger({ logLevel: 'info' })
    const longContent = 'x'.repeat(300)
    const event = makeMessageEvent(longContent)

    logger.logEvent(event)

    expect(logSpy).toHaveBeenCalledOnce()
    const args = logSpy.mock.calls[0]!
    // Content should be truncated to 200 chars + '...'
    const preview = args.find((a: unknown) => typeof a === 'string' && a.endsWith('...'))
    expect(preview).toBeDefined()
    expect((preview as string).length).toBe(203) // 200 + '...'
  })

  it('writes slim format for raw events with only source_type', () => {
    const logger = makeLogger({ logLevel: 'info' })
    const event = makeRawEvent('cli_pre_normalization', { big: 'payload' })

    logger.logEvent(event)

    expect(logSpy).toHaveBeenCalledOnce()
    const args = logSpy.mock.calls[0]!
    expect(args).toContain('cli_pre_normalization')
    // Full data should not appear
    expect(args).not.toContainEqual({ big: 'payload' })
  })
})

describe('logLevel option', () => {
  it('option overrides environment default', () => {
    // No KOMBUSE_LOG_LEVEL env var set, so default would be 'info'
    // But explicit logLevel: 'debug' should produce debug output
    const debugLogger = makeLogger({ logLevel: 'debug' })
    const infoLogger = makeLogger({ logLevel: 'info' })
    const event = makeMessageEvent('test content for level override')

    debugLogger.logEvent(event)
    const debugArgs = logSpy.mock.calls[0]!

    logSpy.mockClear()

    infoLogger.logEvent(event)
    const infoArgs = logSpy.mock.calls[0]!

    // Debug should include full content field
    expect(debugArgs).toContain('test content for level override')
    // Info should include content_preview (same string since it's < 200 chars)
    // But the key difference is that debug spreads all event fields (including role, content, etc.)
    // while info only spreads the slim fields (role, content_preview)
    // Debug args should have more values than info args
    expect(debugArgs.length).toBeGreaterThan(infoArgs.length)
  })
})
