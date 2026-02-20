import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v3'

export interface ApiRouteInfo {
  method: string
  path: string
}

export interface InjectableServer {
  inject(opts: {
    method: string
    url: string
    payload?: unknown
  }): Promise<{ statusCode: number; body: string }>
}

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
 * Register API discovery and invocation MCP tools.
 * These allow agents to list available REST endpoints and call GET endpoints
 * via in-process request injection (no HTTP overhead).
 */
export function registerApiTools(
  server: McpServer,
  injectable: InjectableServer,
  routes: ApiRouteInfo[]
): void {
  const registerTool = (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool.bind(server) as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => void

  registerTool(
    'list_api_endpoints',
    {
      description:
        'List all available Kombuse API endpoints. Returns method and path for each endpoint. Use this to discover what API calls are available before using call_api.',
      inputSchema: {
        method: z
          .enum(['GET', 'POST', 'PATCH', 'DELETE'])
          .optional()
          .describe('Filter by HTTP method. If omitted, all methods are returned.'),
      },
    },
    async ({ method }) => {
      let filtered = routes
      if (method) {
        filtered = routes.filter((r) => r.method === method)
      }
      return successResponse({
        endpoints: filtered,
        total: filtered.length,
      })
    }
  )

  registerTool(
    'call_api',
    {
      description:
        'Call a Kombuse API endpoint (GET only). Uses in-process request injection for zero-latency access. Returns the HTTP status code and parsed response body.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            'API path including /api prefix, e.g. "/api/tickets" or "/api/projects/1"'
          ),
        query: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Optional query parameters as key-value pairs, e.g. {"status": "open", "limit": "10"}'
          ),
      },
    },
    async ({ path, query }) => {
      // Normalize to resolve '..' segments before checking prefix (prevents traversal bypass)
      const normalized = new URL(path, 'http://n').pathname
      if (!normalized.startsWith('/api/')) {
        return errorResponse(
          'Path must start with /api/. Use list_api_endpoints to discover available paths.'
        )
      }

      const queryString = query ? '?' + new URLSearchParams(query).toString() : ''
      const url = normalized + queryString

      try {
        const response = await injectable.inject({ method: 'GET', url })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        return successResponse({ status: response.statusCode, body })
      } catch (err) {
        return errorResponse(`API call failed: ${(err as Error).message}`)
      }
    }
  )
}
