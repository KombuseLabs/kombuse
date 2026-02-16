import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { modelRoutes } from '../routes/models'

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
