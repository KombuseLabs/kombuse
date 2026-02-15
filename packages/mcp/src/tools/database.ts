import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  describeDatabaseTable,
  listDatabaseTables,
  queryDatabaseReadOnly,
} from '@kombuse/persistence'
import { z } from 'zod/v3'

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
 * Register dev-only database query MCP tools.
 * These tools provide raw read-only SQL access for debugging and exploration.
 */
export function registerDatabaseTools(server: McpServer): void {
  const registerTool = (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool.bind(server) as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => void

  registerTool(
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
      try {
        return successResponse(queryDatabaseReadOnly(sql, params))
      } catch (err) {
        return errorResponse((err as Error).message)
      }
    }
  )

  registerTool(
    'list_tables',
    {
      description:
        'List all tables and views in the database. Use describe_table to see column details for a specific table.',
      inputSchema: {},
    },
    async () => {
      return successResponse({ tables: listDatabaseTables() })
    }
  )

  registerTool(
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
      try {
        return successResponse(describeDatabaseTable(table_name))
      } catch (err) {
        return errorResponse((err as Error).message)
      }
    }
  )
}
