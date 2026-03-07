import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, DEMO_PROJECT_ID, getDatabase } from '@kombuse/persistence'
import { createServer } from '../index'
import { stopAllActiveBackends } from '../services/agent-execution-service'
import { closeAppLogger } from '../logger'

/**
 * Mocks for modules that have global side effects when createServer runs.
 *
 * - stopAllActiveBackends / closeAppLogger: mocked as vi.fn() so we can assert
 *   whether close() invokes them for isolated vs primary servers.
 * - cleanupOrphanedSessions: called at primary server startup; mocked to avoid
 *   real DB queries in non-request context.
 * - createAppLogger: module-level call in index.ts (line 59); mocking prevents
 *   real file-system log operations during tests.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: DB isolation
//
// Each createServer call initialises its own SQLite :memory: instance.  The
// primary server calls setDatabase(db), so getDatabase() outside a request
// context returns primary's DB.  The isolated server does NOT call setDatabase,
// so its DB is only reachable via the onRequest ALS hook it installs.
// ─────────────────────────────────────────────────────────────────────────────
describe('isolated server — DB isolation', () => {
  let primary: Awaited<ReturnType<typeof createServer>>
  let isolated: Awaited<ReturnType<typeof createServer>>

  beforeEach(async () => {
    vi.clearAllMocks()
    primary = await createServer({ port: 0, dbPath: ':memory:' })
    isolated = await createServer({ port: 0, dbPath: ':memory:', isolated: true })
    await primary.instance.ready()
    await isolated.instance.ready()
  })

  afterEach(async () => {
    await isolated.close()
    await primary.close()
    closeDatabase()
  })

  it('primary server reads from its own database', async () => {
    // getDatabase() returns primary's DB because primary called setDatabase(db).
    const primaryDb = getDatabase()
    primaryDb
      .prepare(`INSERT INTO profiles (id, type, name) VALUES ('primary-only', 'user', 'Primary Only')`)
      .run()

    const resp = await primary.instance.inject({
      method: 'GET',
      url: '/api/profiles',
      headers: { host: 'localhost' },
    })

    expect(resp.statusCode).toBe(200)
    const profiles = resp.json() as { id: string }[]
    expect(profiles.some((p) => p.id === 'primary-only')).toBe(true)
  })

  it('isolated server returns demo project with valid slug', async () => {
    const resp = await isolated.instance.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: 'localhost' },
    })

    expect(resp.statusCode).toBe(200)
    const projects = resp.json() as { id: string; slug: string }[]
    const demo = projects.find((p) => p.id === DEMO_PROJECT_ID)
    expect(demo).toBeDefined()
    expect(demo!.slug).toBe('acme-project')
  })

  it('isolated server does not see data inserted into the primary database', async () => {
    // Same insertion into primary's DB.
    const primaryDb = getDatabase()
    primaryDb
      .prepare(`INSERT INTO profiles (id, type, name) VALUES ('primary-only', 'user', 'Primary Only')`)
      .run()

    // The isolated server's onRequest hook sets dbContext to its own :memory: DB,
    // which is independent from primary's DB and does not contain 'primary-only'.
    const resp = await isolated.instance.inject({
      method: 'GET',
      url: '/api/profiles',
      headers: { host: 'localhost' },
    })

    expect(resp.statusCode).toBe(200)
    const profiles = resp.json() as { id: string }[]
    expect(profiles.some((p) => p.id === 'primary-only')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: close() behaviour
//
// The close() function in createServer guards stopAllActiveBackends() and
// closeAppLogger() behind `if (!isolated)`.  Verifying this prevents regressions
// where closing a docs/screenshot isolated window could kill the primary server's
// running agent sessions or shut down its logger.
// ─────────────────────────────────────────────────────────────────────────────
describe('isolated server — close() behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not call stopAllActiveBackends or closeAppLogger when isolated: true', async () => {
    const server = await createServer({ port: 0, dbPath: ':memory:', isolated: true })
    await server.instance.ready()

    await server.close()

    expect(stopAllActiveBackends).not.toHaveBeenCalled()
    expect(closeAppLogger).not.toHaveBeenCalled()

    closeDatabase()
  })

  it('calls stopAllActiveBackends and closeAppLogger when isolated: false (primary)', async () => {
    const server = await createServer({ port: 0, dbPath: ':memory:' })
    await server.instance.ready()

    await server.close()

    expect(stopAllActiveBackends).toHaveBeenCalledOnce()
    expect(closeAppLogger).toHaveBeenCalledOnce()

    closeDatabase()
  })
})
