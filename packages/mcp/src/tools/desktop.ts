import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { InjectableServer } from './api'
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

export function registerDesktopTools(
  server: McpServer,
  injectable: InjectableServer,
): void {
  const registerTool = (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool.bind(server) as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => void

  registerTool(
    'list_windows',
    {
      description:
        'List all open Kombuse desktop windows. Returns each window\'s id, title, and current URL.',
      inputSchema: {},
    },
    async () => {
      try {
        const response = await injectable.inject({
          method: 'GET',
          url: '/api/desktop/windows',
        })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        if (response.statusCode >= 400) {
          return errorResponse(`Failed to list windows: ${JSON.stringify(body)}`)
        }

        return successResponse(body)
      } catch (err) {
        return errorResponse(`list_windows failed: ${(err as Error).message}`)
      }
    }
  )

  registerTool(
    'open_window',
    {
      description:
        'Open a new Kombuse desktop window. Optionally navigate to a specific path (e.g. "/projects/1/tickets/42"). Returns the new window\'s id, title, and URL.',
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe('App path to navigate to, e.g. "/projects/1/tickets/42"'),
      },
    },
    async ({ path }) => {
      try {
        const response = await injectable.inject({
          method: 'POST',
          url: '/api/desktop/windows',
          payload: path ? { path } : {},
        })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        if (response.statusCode >= 400) {
          return errorResponse(`Failed to open window: ${JSON.stringify(body)}`)
        }

        return successResponse(body)
      } catch (err) {
        return errorResponse(`open_window failed: ${(err as Error).message}`)
      }
    }
  )

  registerTool(
    'navigate_to',
    {
      description:
        'Navigate an existing Kombuse desktop window to a new path. Requires the window id (from list_windows or open_window) and the target path.',
      inputSchema: {
        window_id: z
          .number()
          .int()
          .positive()
          .describe('The window id to navigate'),
        path: z
          .string()
          .min(1)
          .describe('App path to navigate to, e.g. "/projects/1/tickets/42"'),
      },
    },
    async ({ window_id, path }) => {
      try {
        const response = await injectable.inject({
          method: 'POST',
          url: `/api/desktop/windows/${window_id}/navigate`,
          payload: { path },
        })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        if (response.statusCode >= 400) {
          return errorResponse(`Failed to navigate: ${JSON.stringify(body)}`)
        }

        return successResponse(body)
      } catch (err) {
        return errorResponse(`navigate_to failed: ${(err as Error).message}`)
      }
    }
  )

  registerTool(
    'take_screenshot',
    {
      description:
        'Capture a screenshot of a Kombuse desktop window. Returns the screenshot as a PNG image. Requires the window id (from list_windows or open_window).',
      inputSchema: {
        window_id: z
          .number()
          .int()
          .positive()
          .describe('The window id to capture'),
      },
    },
    async ({ window_id }) => {
      try {
        const response = await injectable.inject({
          method: 'POST',
          url: `/api/desktop/windows/${window_id}/screenshot`,
        })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        if (response.statusCode >= 400) {
          return errorResponse(`Failed to take screenshot: ${JSON.stringify(body)}`)
        }

        const { data, mimeType } = body as { data: string; mimeType: string }
        return {
          content: [{
            type: 'image' as const,
            data,
            mimeType,
          }],
        }
      } catch (err) {
        return errorResponse(`take_screenshot failed: ${(err as Error).message}`)
      }
    }
  )
}
