import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  projectsRepository,
  profilesRepository,
} from '@kombuse/persistence'

vi.mock('@kombuse/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kombuse/services')>()
  return {
    ...actual,
    claudeCodeScanner: {
      scan: vi.fn(() => []),
      listSessions: vi.fn(() => []),
      getSessionContent: vi.fn(() => []),
    },
  }
})

import { claudeCodeRoutes } from '../routes/claude-code.routes'

describe('claude-code routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({
      id: 'user-1',
      type: 'user',
      name: 'Test User',
    })

    app = Fastify()
    await app.register(claudeCodeRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  describe('POST /api/claude-code/projects/import', () => {
    it('creates projects for valid paths', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/claude-code/projects/import',
        payload: { paths: ['/Users/me/project1', '/Users/me/project2'] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toHaveLength(2)
      expect(body[0].local_path).toBe('/Users/me/project1')
      expect(body[1].local_path).toBe('/Users/me/project2')
    })

    it('skips already-imported paths', async () => {
      projectsRepository.create({
        name: 'existing',
        owner_id: 'user-1',
        local_path: '/Users/me/project1',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/claude-code/projects/import',
        payload: { paths: ['/Users/me/project1', '/Users/me/project2'] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toHaveLength(1)
      expect(body[0].local_path).toBe('/Users/me/project2')
    })

    it('handles duplicate paths in single request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/claude-code/projects/import',
        payload: { paths: ['/Users/me/project1', '/Users/me/project1'] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toHaveLength(1)
      expect(body[0].local_path).toBe('/Users/me/project1')
    })

    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/claude-code/projects/import',
        payload: { paths: [] },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for missing paths field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/claude-code/projects/import',
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /api/claude-code/sessions/:sessionId', () => {
    it('returns 400 for non-UUID sessionId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/claude-code/sessions/not-a-valid-uuid?path=/Users/me/project1',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Invalid session ID format')
    })

    it('returns 400 when path query param is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/claude-code/sessions/550e8400-e29b-41d4-a716-446655440000',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Missing required query param: path')
    })
  })
})
