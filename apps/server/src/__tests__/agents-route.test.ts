import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  agentsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { agentRoutes } from '../routes/agents'

describe('GET /agents/by-slug/:slug', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    app = Fastify()
    await app.register(agentRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return agent when slug exists', async () => {
    profilesRepository.create({
      id: 'slug-lookup-agent',
      type: 'agent',
      name: 'Slug Lookup Agent',
      description: 'For testing slug lookup',
    })
    agentsRepository.create({
      id: 'slug-lookup-agent',
      name: 'Slug Lookup Agent',
      description: 'For testing slug lookup',
      system_prompt: 'Test prompt.',
      slug: 'slug-lookup-agent',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/agents/by-slug/slug-lookup-agent',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.id).toBe('slug-lookup-agent')
    expect(body.slug).toBe('slug-lookup-agent')
  })

  it('should return 404 when slug does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agents/by-slug/no-such-agent',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Agent not found' })
  })
})
