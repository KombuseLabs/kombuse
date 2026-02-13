import type { Database as DatabaseType } from 'better-sqlite3'
import { getDatabase } from './database'

export const DEFAULT_QUERY_LIMIT = 100
export const MAX_QUERY_LIMIT = 500

export type DatabaseQueryParam = string | number | null
export type DatabaseRow = Record<string, unknown>

export interface DatabaseTableInfo {
  name: string
  type: 'table' | 'view'
}

export interface DatabaseQueryResult {
  rows: DatabaseRow[]
  count: number
  sql: string
}

export interface DatabaseTableDescription {
  table: string
  columns: unknown[]
  foreign_keys: unknown[]
  indexes: unknown[]
}

/**
 * Add a LIMIT clause if the query doesn't already have one.
 * Intentionally conservative — if LIMIT appears anywhere in the SQL, we leave it alone.
 */
export function ensureLimit(sql: string, limit: number = DEFAULT_QUERY_LIMIT): string {
  const trimmed = sql.trim().replace(/;+$/, '')
  if (/\bLIMIT\b/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed} LIMIT ${limit}`
}

function normalizeLimit(limit?: number): number {
  const value =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : DEFAULT_QUERY_LIMIT
  return Math.min(value, MAX_QUERY_LIMIT)
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function assertTableExists(db: DatabaseType, tableName: string): void {
  const tableExists = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type IN ('table', 'view')
         AND name = ?`
    )
    .get(tableName) as { name: string } | undefined

  if (!tableExists) {
    throw new Error(`Table '${tableName}' not found`)
  }
}

export function queryDatabaseReadOnly(
  sql: string,
  params?: DatabaseQueryParam[],
  limit?: number
): DatabaseQueryResult {
  const db = getDatabase()
  const safeSql = ensureLimit(sql, normalizeLimit(limit))

  let stmt
  try {
    stmt = db.prepare(safeSql)
  } catch (err) {
    throw new Error(`SQL syntax error: ${(err as Error).message}`)
  }

  if (!stmt.readonly) {
    throw new Error(
      'Only read-only queries are allowed. Write operations (INSERT, UPDATE, DELETE, DROP, ALTER, etc.) are rejected.'
    )
  }

  try {
    const rows = (params ? stmt.all(...params) : stmt.all()) as DatabaseRow[]
    return { rows, count: rows.length, sql: safeSql }
  } catch (err) {
    throw new Error(`Query execution error: ${(err as Error).message}`)
  }
}

export function listDatabaseTables(): DatabaseTableInfo[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view')
         AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )
    .all() as DatabaseTableInfo[]
}

export function describeDatabaseTable(tableName: string): DatabaseTableDescription {
  const db = getDatabase()
  assertTableExists(db, tableName)

  const quotedName = quoteIdentifier(tableName)

  return {
    table: tableName,
    columns: db.pragma(`table_info(${quotedName})`) as unknown[],
    foreign_keys: db.pragma(`foreign_key_list(${quotedName})`) as unknown[],
    indexes: db.pragma(`index_list(${quotedName})`) as unknown[],
  }
}
