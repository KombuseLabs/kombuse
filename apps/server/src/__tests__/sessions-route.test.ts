import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  agentsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { sessionRoutes } from '../routes/sessions'

describe('POST /sessions agent_id validation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should create session without agent_id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
    })

    expect(response.statusCode).toBe(201)
  })

  it('should return 404 for non-existent agent_id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent_id: 'non-existent-agent' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Agent not found' })
  })

  it('should return 400 for disabled agent', async () => {
    profilesRepository.create({
      id: 'disabled-agent',
      type: 'agent',
      name: 'Disabled Agent',
    })
    agentsRepository.create({
      id: 'disabled-agent',
      system_prompt: 'test',
      is_enabled: false,
      config: { enabled_for_chat: true },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent_id: 'disabled-agent' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'Agent is disabled' })
  })

  it('should return 400 for agent not enabled for chat', async () => {
    profilesRepository.create({
      id: 'no-chat-agent',
      type: 'agent',
      name: 'No Chat Agent',
    })
    agentsRepository.create({
      id: 'no-chat-agent',
      system_prompt: 'test',
      is_enabled: true,
      config: { enabled_for_chat: false },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent_id: 'no-chat-agent' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'Agent is not enabled for chat' })
  })

  it('should return 400 when agent config has no enabled_for_chat', async () => {
    profilesRepository.create({
      id: 'unconfigured-agent',
      type: 'agent',
      name: 'Unconfigured Agent',
    })
    agentsRepository.create({
      id: 'unconfigured-agent',
      system_prompt: 'test',
      is_enabled: true,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent_id: 'unconfigured-agent' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'Agent is not enabled for chat' })
  })

  it('should create session with valid chat-enabled agent', async () => {
    profilesRepository.create({
      id: 'valid-chat-agent',
      type: 'agent',
      name: 'Valid Chat Agent',
    })
    agentsRepository.create({
      id: 'valid-chat-agent',
      system_prompt: 'test',
      is_enabled: true,
      config: { enabled_for_chat: true },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { agent_id: 'valid-chat-agent' },
    })

    expect(response.statusCode).toBe(201)
  })
})
