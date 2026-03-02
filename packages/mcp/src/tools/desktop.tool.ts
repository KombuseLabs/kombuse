import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { InjectableServer } from './api.tool'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, normalize } from 'node:path'
import { homedir } from 'node:os'
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
        width: z
          .number()
          .int()
          .min(200)
          .optional()
          .describe('Window width in pixels (minimum 200, default 1200)'),
        height: z
          .number()
          .int()
          .min(200)
          .optional()
          .describe('Window height in pixels (minimum 200, default 800)'),
        isolated: z
          .boolean()
          .optional()
          .describe('When true, opens the window backed by an isolated docs database (~/.kombuse/docs.db). Use for documentation screenshots to avoid capturing private user data.'),
      },
    },
    async ({ path, width, height, isolated }) => {
      try {
        const payload: Record<string, unknown> = {}
        if (path) payload.path = path
        if (width !== undefined) payload.width = width
        if (height !== undefined) payload.height = height
        if (isolated !== undefined) payload.isolated = isolated

        const response = await injectable.inject({
          method: 'POST',
          url: '/api/desktop/windows',
          payload,
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

  registerTool(
    'save_screenshot',
    {
      description:
        'Capture a screenshot of a Kombuse desktop window and save it as a PNG file to disk. Returns the written file path and size.',
      inputSchema: {
        window_id: z
          .number()
          .int()
          .positive()
          .describe('The window id to capture'),
        file_path: z
          .string()
          .min(1)
          .describe('Absolute file path to write the PNG to, e.g. "/path/to/screenshot.png"'),
      },
    },
    async ({ window_id, file_path }) => {
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
          return errorResponse(`Failed to capture screenshot: ${JSON.stringify(body)}`)
        }

        const { data } = body as { data: string; mimeType: string }
        const buffer = Buffer.from(data, 'base64')

        const normalized = normalize(resolve(file_path))
        const home = homedir()
        if (normalized.includes('..') || !normalized.startsWith(home)) {
          return errorResponse('file_path must be an absolute path within the home directory')
        }
        if (!normalized.endsWith('.png')) {
          return errorResponse('file_path must end with .png')
        }

        try {
          mkdirSync(dirname(normalized), { recursive: true })
          writeFileSync(normalized, buffer)
        } catch (fsErr) {
          return errorResponse(`Failed to write file: ${(fsErr as Error).message}`)
        }

        return successResponse({ file_path: normalized, size: buffer.length })
      } catch (err) {
        return errorResponse(`save_screenshot failed: ${(err as Error).message}`)
      }
    }
  )

  registerTool(
    'close_window',
    {
      description:
        'Close a Kombuse desktop window. Requires the window id (from list_windows or open_window).',
      inputSchema: {
        window_id: z
          .number()
          .int()
          .positive()
          .describe('The window id to close'),
      },
    },
    async ({ window_id }) => {
      try {
        const response = await injectable.inject({
          method: 'DELETE',
          url: `/api/desktop/windows/${window_id}`,
        })

        let body: unknown
        try {
          body = JSON.parse(response.body)
        } catch {
          body = response.body
        }

        if (response.statusCode >= 400) {
          return errorResponse(`Failed to close window: ${JSON.stringify(body)}`)
        }

        return successResponse(body)
      } catch (err) {
        return errorResponse(`close_window failed: ${(err as Error).message}`)
      }
    }
  )
}
