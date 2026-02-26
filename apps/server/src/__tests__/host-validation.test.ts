import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '@kombuse/persistence'
import { createServer } from '../index'

describe('host header validation', () => {
  let server: Awaited<ReturnType<typeof createServer>>

  beforeEach(async () => {
    server = await createServer({ port: 0, dbPath: ':memory:' })
    await server.instance.ready()
  })

  afterEach(async () => {
    await server.close()
    closeDatabase()
  })

  it('allows requests with Host: localhost:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'localhost:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: 127.0.0.1:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '127.0.0.1:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: [::1]:PORT', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '[::1]:3331' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('allows requests with Host: localhost (no port)', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'localhost' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('rejects requests with Host: evil.com', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.com' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects requests with Host: evil.com:3331', async () => {
    const response = await server.instance.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.com:3331' },
    })
    expect(response.statusCode).toBe(403)
  })

})
