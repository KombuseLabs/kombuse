import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getDatabase } from '@kombuse/persistence'
import { z } from 'zod'

const DEFAULT_LIMIT = 100

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  }
}

function successResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

/**
 * Add a LIMIT clause if the query doesn't already have one.
 * Intentionally conservative — if LIMIT appears anywhere in the SQL, we leave it alone.
 */
function ensureLimit(sql: string, limit: number = DEFAULT_LIMIT): string {
  const trimmed = sql.trim().replace(/;+$/, '')
  if (/\bLIMIT\b/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed} LIMIT ${limit}`
}

/**
 * Register dev-only database query MCP tools.
 * These tools provide raw read-only SQL access for debugging and exploration.
 */
export function registerDatabaseTools(server: McpServer): void {
  server.registerTool(
    'query_db',
    {
      description:
        'Execute a read-only SQL query against the database. Only SELECT and other read-only statements are allowed; write operations are rejected. A default LIMIT of 100 is added if no LIMIT clause is present.',
      inputSchema: {
        sql: z
          .string()
          .min(1)
          .describe('The SQL query to execute. Must be read-only (SELECT, etc.).'),
        params: z
          .array(z.union([z.string(), z.number(), z.null()]))
          .optional()
          .describe('Optional positional bind parameters for the query'),
      },
    },
    async ({ sql, params }) => {
      const db = getDatabase()

      const safeSql = ensureLimit(sql)

      let stmt
      try {
        stmt = db.prepare(safeSql)
      } catch (err) {
        return errorResponse(`SQL syntax error: ${(err as Error).message}`)
      }

      if (!stmt.readonly) {
        return errorResponse(
          'Only read-only queries are allowed. Write operations (INSERT, UPDATE, DELETE, DROP, ALTER, etc.) are rejected.'
        )
      }

      try {
        const rows = params ? stmt.all(...params) : stmt.all()
        return successResponse({ rows, count: rows.length, sql: safeSql })
      } catch (err) {
        return errorResponse(`Query execution error: ${(err as Error).message}`)
      }
    }
  )

  server.registerTool(
    'list_tables',
    {
      description:
        'List all tables and views in the database. Use describe_table to see column details for a specific table.',
      inputSchema: {},
    },
    async () => {
      const db = getDatabase()
      const tables = db
        .prepare(
          `SELECT name, type FROM sqlite_master
           WHERE type IN ('table', 'view')
             AND name NOT LIKE 'sqlite_%'
           ORDER BY type, name`
        )
        .all() as { name: string; type: string }[]

      return successResponse({ tables })
    }
  )

  server.registerTool(
    'describe_table',
    {
      description:
        'Describe the schema of a specific table. Returns column definitions, foreign key relationships, and indexes.',
      inputSchema: {
        table_name: z
          .string()
          .min(1)
          .describe('The name of the table to describe'),
      },
    },
    async ({ table_name }) => {
      const db = getDatabase()

      // Validate table exists to prevent PRAGMA injection
      const tableExists = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`
        )
        .get(table_name) as { name: string } | undefined

      if (!tableExists) {
        return errorResponse(`Table '${table_name}' not found`)
      }

      const columns = db.pragma(`table_info(${table_name})`)
      const foreignKeys = db.pragma(`foreign_key_list(${table_name})`)
      const indexes = db.pragma(`index_list(${table_name})`)

      return successResponse({
        table: table_name,
        columns,
        foreign_keys: foreignKeys,
        indexes,
      })
    }
  )
}
