import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { modelRoutes, inferModelProvider } from '../routes/models'

describe('models route', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await app.register(modelRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns model catalog for codex backend', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/models?backend_type=codex',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.backend_type).toBe('codex')
    expect(body.supports_model_selection).toBe(true)
    expect(body.models.length).toBeGreaterThan(0)
    expect(body.default_model_id).toBeDefined()
    for (const model of body.models) {
      expect(['OpenAI', 'Anthropic']).toContain(model.provider)
    }
  })

  it('returns model catalog for claude-code backend', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/models?backend_type=claude-code',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.backend_type).toBe('claude-code')
    expect(body.supports_model_selection).toBe(true)
    expect(body.models.length).toBeGreaterThan(0)
    expect(body.default_model_id).toBeDefined()
    for (const model of body.models) {
      expect(model.provider).toBe('Anthropic')
    }
  })

  it('returns 400 when backend_type query param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/models',
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(Array.isArray(body.error)).toBe(true)
  })

  it('returns 400 for invalid backend_type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/models?backend_type=invalid',
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(Array.isArray(body.error)).toBe(true)
  })
})

describe('inferModelProvider', () => {
  it('returns Anthropic for claude-prefixed model IDs', () => {
    expect(inferModelProvider('claude-sonnet-4-5')).toBe('Anthropic')
    expect(inferModelProvider('claude-opus-4')).toBe('Anthropic')
    expect(inferModelProvider('claude-sonnet-4')).toBe('Anthropic')
  })

  it('returns OpenAI for non-claude model IDs', () => {
    expect(inferModelProvider('o3')).toBe('OpenAI')
    expect(inferModelProvider('gpt-4.1')).toBe('OpenAI')
    expect(inferModelProvider('gpt-4o-mini')).toBe('OpenAI')
    expect(inferModelProvider('o4-mini')).toBe('OpenAI')
  })
})
