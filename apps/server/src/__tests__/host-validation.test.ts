import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase } from '@kombuse/persistence'
import { createServer } from '../index'

vi.mock('../services/agent-execution-service', () => ({
  stopAllActiveBackends: vi.fn(),
  cleanupOrphanedSessions: vi.fn().mockReturnValue(0),
  processEventAndRunAgents: vi.fn(),
}))

vi.mock('../logger', () => ({
  createAppLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
  closeAppLogger: vi.fn(),
  pruneOldLogs: vi.fn(),
  setLogDir: vi.fn(),
  setLogTarget: vi.fn(),
}))

vi.mock('@kombuse/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kombuse/services')>()),
  readFileLoggingEnabled: vi.fn().mockReturnValue(false),
  readCrashReportingEnabled: vi.fn().mockReturnValue(false),
}))

describe('host header validation', () => {
  let server: Awaited<ReturnType<typeof createServer>>

  beforeEach(async () => {
    server = await createServer({ port: 0, dbPath: ':memory:' })
    await server.instance.ready()
  })

  afterEach(async () => {
    await server.close()
    closeDatabase()
  })

  it('allows requests with Host: localhost:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'localhost:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: 127.0.0.1:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '127.0.0.1:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: [::1]:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '[::1]:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: localhost (no port)', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'localhost' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('rejects requests with Host: evil.com', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.com' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects requests with Host: evil.com:3331', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.com:3331' },
    })
    expect(response.statusCode).toBe(403)
  })

})
