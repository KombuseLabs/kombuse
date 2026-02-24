import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  agentsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { agentRoutes } from '../routes/agents.routes'

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

describe('POST /agents/:id/reset-to-plugin-defaults', () => {
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

  it('should reset agent to plugin defaults', async () => {
    profilesRepository.create({
      id: 'reset-agent',
      type: 'agent',
      name: 'Reset Agent',
      description: 'For testing reset',
    })
    agentsRepository.create({
      id: 'reset-agent',
      name: 'Reset Agent',
      description: 'For testing reset',
      system_prompt: 'User changed this',
      slug: 'reset-agent',
      plugin_base: { system_prompt: 'Plugin original', permissions: [], config: {}, is_enabled: true },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/agents/reset-agent/reset-to-plugin-defaults',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().system_prompt).toBe('Plugin original')
  })

  it('should return 404 for non-existent agent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agents/nonexistent/reset-to-plugin-defaults',
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 409 when agent has no plugin_base', async () => {
    profilesRepository.create({
      id: 'no-base',
      type: 'agent',
      name: 'No Base',
      description: 'For testing',
    })
    agentsRepository.create({
      id: 'no-base',
      name: 'No Base',
      description: 'For testing',
      system_prompt: 'Test',
      slug: 'no-base',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/agents/no-base/reset-to-plugin-defaults',
    })

    expect(response.statusCode).toBe(409)
  })
})
