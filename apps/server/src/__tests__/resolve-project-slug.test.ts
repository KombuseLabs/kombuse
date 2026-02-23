import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  projectsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { resolveProjectSlug } from '../hooks/resolve-project-slug'

describe('resolveProjectSlug hook', () => {
  let app: FastifyInstance
  let testProjectId: string

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    profilesRepository.create({
      id: 'owner-1',
      type: 'user',
      name: 'Test Owner',
    })

    const project = projectsRepository.create({
      name: 'My Test Project',
      owner_id: 'owner-1',
    })
    testProjectId = project.id

    app = Fastify()
    app.addHook('preHandler', resolveProjectSlug)

    // Echo route that returns the resolved projectId
    app.get<{ Params: { projectId: string } }>(
      '/api/projects/:projectId/echo',
      async (request) => {
        return { projectId: request.params.projectId }
      },
    )

    // Route without :projectId to verify no interference
    app.get('/api/other', async () => ({ ok: true }))

    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('passes UUID through unchanged', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${testProjectId}/echo`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().projectId).toBe(testProjectId)
  })

  it('resolves slug to UUID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/my-test-project/echo',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().projectId).toBe(testProjectId)
  })

  it('returns 404 for unknown slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/nonexistent-slug/echo',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Project not found' })
  })

  it('does not interfere with routes without :projectId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/other',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('passes unknown UUID through without validation', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${fakeUuid}/echo`,
    })

    // UUID passes regex check — hook skips it, handler receives it as-is
    expect(response.statusCode).toBe(200)
    expect(response.json().projectId).toBe(fakeUuid)
  })
})
