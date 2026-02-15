import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, runMigrations, setDatabase } from '../database'
import {
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  queryDatabaseReadOnly,
} from '../database-query'

const LARGE_READ_QUERY = `
  WITH RECURSIVE numbers(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM numbers WHERE n < 1000
  )
  SELECT n FROM numbers LIMIT 1000
`

describe('queryDatabaseReadOnly', () => {
  beforeEach(() => {
    const db = new Database(':memory:')
    runMigrations(db)
    setDatabase(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('enforces the default row cap even when SQL already includes a larger LIMIT', () => {
    const result = queryDatabaseReadOnly(LARGE_READ_QUERY)

    expect(result.count).toBe(DEFAULT_QUERY_LIMIT)
    expect(result.rows).toHaveLength(DEFAULT_QUERY_LIMIT)
    expect(result.rows[0]?.n).toBe(1)
    expect(result.rows[DEFAULT_QUERY_LIMIT - 1]?.n).toBe(DEFAULT_QUERY_LIMIT)
  })

  it('caps requested limits at MAX_QUERY_LIMIT', () => {
    const result = queryDatabaseReadOnly(LARGE_READ_QUERY, undefined, MAX_QUERY_LIMIT + 200)

    expect(result.count).toBe(MAX_QUERY_LIMIT)
    expect(result.rows).toHaveLength(MAX_QUERY_LIMIT)
    expect(result.rows[MAX_QUERY_LIMIT - 1]?.n).toBe(MAX_QUERY_LIMIT)
  })

  it('rejects non-read-only statements', () => {
    expect(() => queryDatabaseReadOnly("INSERT INTO profiles (id, type, name) VALUES ('u1', 'user', 'User')")).toThrow(
      /Only read-only queries are allowed/
    )
  })
})
