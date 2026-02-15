import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, initializeDatabase, setDatabase } from '@kombuse/persistence'
import { databaseRoutes } from '../routes/database'

const LARGE_READ_QUERY = `
  WITH RECURSIVE numbers(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM numbers WHERE n < 1000
  )
  SELECT n FROM numbers LIMIT 1000
`

describe('database routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    app = Fastify()
    await app.register(databaseRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('lists database tables', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/database/tables',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { tables: Array<{ name: string; type: 'table' | 'view' }> }
    expect(body.tables.some((table) => table.name === 'profiles' && table.type === 'table')).toBe(true)
  })

  it('returns validation errors for malformed query payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/database/query',
      payload: { limit: 10 },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { error: unknown }
    expect(Array.isArray(body.error)).toBe(true)
  })

  it('enforces row caps even when submitted SQL already contains a larger LIMIT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/database/query',
      payload: { sql: LARGE_READ_QUERY },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { rows: Array<{ n: number }>; count: number }
    expect(body.count).toBe(100)
    expect(body.rows).toHaveLength(100)
    expect(body.rows[0]?.n).toBe(1)
    expect(body.rows[99]?.n).toBe(100)
  })

  it('rejects write queries', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/database/query',
      payload: {
        sql: "INSERT INTO profiles (id, type, name) VALUES ('u1', 'user', 'User')",
      },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { error: string }
    expect(body.error).toContain('Only read-only queries are allowed')
  })
})
