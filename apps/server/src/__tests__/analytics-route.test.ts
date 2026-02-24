import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  getDatabase,
  initializeDatabase,
  setDatabase,
  sessionsRepository,
  projectsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { analyticsRoutes } from '../routes/analytics.routes'

describe('GET /analytics/sessions-per-day', () => {
  let app: FastifyInstance
  const TEST_PROJECT_ID = 'test-project'

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({ id: 'user-1', type: 'user', name: 'Test User' })
    projectsRepository.create({ id: TEST_PROJECT_ID, name: 'Test Project', owner_id: 'user-1' })

    app = Fastify()
    await app.register(analyticsRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return 400 when project_id is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/sessions-per-day',
    })

    expect(response.statusCode).toBe(400)
  })

  it('should return empty array for project with no sessions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/sessions-per-day?project_id=' + TEST_PROJECT_ID,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('should return sessions grouped by day', async () => {
    const db = getDatabase()
    const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
    const s2 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

    db.prepare("UPDATE sessions SET created_at = '2026-02-15 10:00:00' WHERE id = ?").run(s1.id)
    db.prepare("UPDATE sessions SET created_at = '2026-02-15 14:00:00' WHERE id = ?").run(s2.id)

    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/sessions-per-day?project_id=' + TEST_PROJECT_ID + '&days=365',
    })

    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ date: '2026-02-15', count: 2 })
  })

  it('should respect the days query parameter', async () => {
    const db = getDatabase()
    const s1 = sessionsRepository.create({ project_id: TEST_PROJECT_ID })
    db.prepare("UPDATE sessions SET created_at = date('now', '-60 days') WHERE id = ?").run(s1.id)

    const response30 = await app.inject({
      method: 'GET',
      url: '/api/analytics/sessions-per-day?project_id=' + TEST_PROJECT_ID + '&days=30',
    })

    const response90 = await app.inject({
      method: 'GET',
      url: '/api/analytics/sessions-per-day?project_id=' + TEST_PROJECT_ID + '&days=90',
    })

    expect(response30.statusCode).toBe(200)
    expect(response30.json()).toHaveLength(0)

    expect(response90.statusCode).toBe(200)
    expect(response90.json()).toHaveLength(1)
  })
})

describe('GET /analytics/most-frequent-reads', () => {
  let app: FastifyInstance
  const TEST_PROJECT_ID = 'test-project'

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({ id: 'user-1', type: 'user', name: 'Test User' })
    projectsRepository.create({ id: TEST_PROJECT_ID, name: 'Test Project', owner_id: 'user-1' })

    app = Fastify()
    await app.register(analyticsRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return 400 when project_id is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/most-frequent-reads',
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return empty array for project with no read events', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/most-frequent-reads?project_id=' + TEST_PROJECT_ID,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('should return read counts grouped by file path', async () => {
    const db = getDatabase()
    const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 1, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Read', id: 'r1', input: { file_path: '/src/index.ts' } }))
    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 2, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Read', id: 'r2', input: { file_path: '/src/index.ts' } }))

    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/most-frequent-reads?project_id=' + TEST_PROJECT_ID + '&days=365',
    })

    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ file_path: '/src/index.ts', read_count: 2 })
  })
})

describe('GET /analytics/tool-calls-per-session', () => {
  let app: FastifyInstance
  const TEST_PROJECT_ID = 'test-project'

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({ id: 'user-1', type: 'user', name: 'Test User' })
    projectsRepository.create({ id: TEST_PROJECT_ID, name: 'Test Project', owner_id: 'user-1' })

    app = Fastify()
    await app.register(analyticsRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return 400 when project_id is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-calls-per-session',
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return empty array for project with no tool calls', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-calls-per-session?project_id=' + TEST_PROJECT_ID,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('should return tool call counts per session', async () => {
    const db = getDatabase()
    const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 1, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Read', id: 't1' }))
    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 2, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Bash', id: 't2' }))

    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-calls-per-session?project_id=' + TEST_PROJECT_ID + '&days=365',
    })

    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data).toHaveLength(1)
    expect(data[0].call_count).toBe(2)
  })
})

describe('GET /analytics/slowest-tools', () => {
  let app: FastifyInstance
  const TEST_PROJECT_ID = 'test-project'

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({ id: 'user-1', type: 'user', name: 'Test User' })
    projectsRepository.create({ id: TEST_PROJECT_ID, name: 'Test Project', owner_id: 'user-1' })

    app = Fastify()
    await app.register(analyticsRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return 400 when project_id is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/slowest-tools',
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return empty array for project with no tool calls', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/slowest-tools?project_id=' + TEST_PROJECT_ID,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })
})

describe('GET /analytics/tool-call-volume', () => {
  let app: FastifyInstance
  const TEST_PROJECT_ID = 'test-project'

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({ id: 'user-1', type: 'user', name: 'Test User' })
    projectsRepository.create({ id: TEST_PROJECT_ID, name: 'Test Project', owner_id: 'user-1' })

    app = Fastify()
    await app.register(analyticsRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return 400 when project_id is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-call-volume',
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return empty array for project with no tool calls', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-call-volume?project_id=' + TEST_PROJECT_ID,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('should return tool call volume grouped by tool name', async () => {
    const db = getDatabase()
    const session = sessionsRepository.create({ project_id: TEST_PROJECT_ID })

    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 1, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Read', id: 't1' }))
    db.prepare(
      `INSERT INTO session_events (session_id, seq, event_type, payload)
       VALUES (?, 2, 'tool_use', ?)`
    ).run(session.id, JSON.stringify({ name: 'Read', id: 't2' }))

    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/tool-call-volume?project_id=' + TEST_PROJECT_ID + '&days=365',
    })

    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ tool_name: 'Read', call_count: 2, session_count: 1 })
  })
})
