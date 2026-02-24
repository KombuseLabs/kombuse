import { Readable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createResponseValidationHook } from '../schemas/response-validation.schema'

describe('response validation hook', () => {
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(
      apps.map(async (app) => {
        await app.close()
      })
    )
    apps.length = 0
  })

  it('passes through valid success payloads', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook(
      'preSerialization',
      createResponseValidationHook({
        resolveSuccessSchema: (routeKey) =>
          routeKey === 'GET /api/test-ok'
            ? z.object({ ok: z.literal(true) })
            : undefined,
      })
    )

    app.get('/api/test-ok', async () => ({ ok: true }))
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/test-ok',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('returns standardized 500 errors when success payload validation fails', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook(
      'preSerialization',
      createResponseValidationHook({
        resolveSuccessSchema: (routeKey) =>
          routeKey === 'GET /api/test-invalid'
            ? z.object({ count: z.number().int() })
            : undefined,
      })
    )

    app.get('/api/test-invalid', async () => ({ count: 'one' }))
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/test-invalid',
    })

    const body = response.json() as {
      error: string
      code?: string
      details?: { route?: string }
    }

    expect(response.statusCode).toBe(500)
    expect(body.error).toBe('Response validation failed')
    expect(body.code).toBe('RESPONSE_VALIDATION_ERROR')
    expect(body.details?.route).toBe('GET /api/test-invalid')
  })

  it('standardizes request-validation errors with top-level error + details', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook('preSerialization', createResponseValidationHook())

    app.get('/api/test-validation', async (_request, reply) => {
      return reply.status(400).send({
        error: [
          {
            path: ['field'],
            message: 'Required',
            code: 'invalid_type',
          },
        ],
      })
    })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/test-validation',
    })

    const body = response.json() as {
      error: string
      code?: string
      details?: { issues?: Array<{ path: Array<string | number> }> }
    }

    expect(response.statusCode).toBe(400)
    expect(body.error).toBe('Validation failed')
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.details?.issues?.[0]?.path).toEqual(['field'])
  })

  it('preserves non-standard error metadata under details', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook('preSerialization', createResponseValidationHook())

    app.get('/api/test-conflict', async (_request, reply) => {
      return reply.status(409).send({
        error: 'Claim conflict',
        ticket: { id: 42 },
      })
    })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/test-conflict',
    })

    const body = response.json() as {
      error: string
      details?: { ticket?: { id: number } }
    }

    expect(response.statusCode).toBe(409)
    expect(body.error).toBe('Claim conflict')
    expect(body.details?.ticket?.id).toBe(42)
  })

  it('bypasses stream routes', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook(
      'preSerialization',
      createResponseValidationHook({
        isStreamRoute: (routeKey) => routeKey === 'GET /api/test-stream',
      })
    )

    app.get('/api/test-stream', async (_request, reply) => {
      reply.type('text/plain')
      return reply.send(Readable.from(['stream-ok']))
    })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/test-stream',
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('stream-ok')
  })

  it('bypasses no-body routes', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook(
      'preSerialization',
      createResponseValidationHook({
        isNoBodyRoute: (routeKey) => routeKey === 'DELETE /api/test-empty',
      })
    )

    app.delete('/api/test-empty', async (_request, reply) => {
      return reply.status(204).send()
    })
    await app.ready()

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/test-empty',
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('normalizes error payloads even on no-body route keys', async () => {
    const app = Fastify()
    apps.push(app)

    app.addHook(
      'preSerialization',
      createResponseValidationHook({
        isNoBodyRoute: (routeKey) => routeKey === 'DELETE /api/test-no-body-error',
      })
    )

    app.delete('/api/test-no-body-error', async (_request, reply) => {
      return reply.status(404).send({ error: ['Not found details'] })
    })
    await app.ready()

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/test-no-body-error',
    })

    const body = response.json() as {
      error: string
      details?: unknown
    }

    expect(response.statusCode).toBe(404)
    expect(body.error).toBe('Request failed')
    expect(body.details).toEqual(['Not found details'])
  })
})
