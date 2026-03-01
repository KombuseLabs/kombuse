import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerDesktopTools, type InjectableServer } from '../index'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: vi.fn(() => '/Users/testuser'),
  }
})

function createMockInjectable(
  response: { statusCode: number; body: string } = { statusCode: 200, body: '{"ok":true}' }
): InjectableServer & { lastCall: { method: string; url: string; payload?: unknown } | null } {
  const mock = {
    lastCall: null as { method: string; url: string; payload?: unknown } | null,
    async inject(opts: { method: string; url: string; payload?: unknown }) {
      mock.lastCall = opts
      return response
    },
  }
  return mock
}

async function setupTestClient(injectable: InjectableServer) {
  const server = new McpServer({ name: 'test', version: '0.0.1' })
  registerDesktopTools(server, injectable)

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.server.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await client.connect(clientTransport)

  return { client, server }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseContent(result: any): unknown {
  const textBlock = result.content[0] as { type: string; text: string }
  return JSON.parse(textBlock.text)
}

describe('list_windows', () => {
  it('should return parsed JSON from inject response', async () => {
    const windows = [
      { id: 1, title: 'Kombuse', url: 'http://localhost:3333/' },
      { id: 2, title: 'Kombuse - Tickets', url: 'http://localhost:3333/projects/1/tickets' },
    ]
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windows),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'list_windows', arguments: {} })
    const data = parseContent(result)

    expect(data).toEqual(windows)
    expect(injectable.lastCall).toEqual({ method: 'GET', url: '/api/desktop/windows' })
  })

  it('should return error response when server returns error status', async () => {
    const injectable = createMockInjectable({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'list_windows', arguments: {} })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to list windows')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Connection refused')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'list_windows', arguments: {} })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Connection refused')
  })
})

describe('open_window', () => {
  it('should open window without path', async () => {
    const windowInfo = { id: 1, title: 'Kombuse', url: 'http://localhost:3333/' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windowInfo),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'open_window', arguments: {} })
    const data = parseContent(result)

    expect(data).toEqual(windowInfo)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows',
      payload: {},
    })
  })

  it('should open window with path', async () => {
    const windowInfo = { id: 2, title: 'Kombuse - Ticket', url: 'http://localhost:3333/projects/1/tickets/42' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windowInfo),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'open_window',
      arguments: { path: '/projects/1/tickets/42' },
    })
    const data = parseContent(result)

    expect(data).toEqual(windowInfo)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows',
      payload: { path: '/projects/1/tickets/42' },
    })
  })

  it('should open window with width and height', async () => {
    const windowInfo = { id: 3, title: 'Kombuse', url: 'http://localhost:3333/' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windowInfo),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'open_window',
      arguments: { width: 800, height: 600 },
    })
    const data = parseContent(result)

    expect(data).toEqual(windowInfo)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows',
      payload: { width: 800, height: 600 },
    })
  })

  it('should open window with only width', async () => {
    const windowInfo = { id: 4, title: 'Kombuse', url: 'http://localhost:3333/' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windowInfo),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'open_window',
      arguments: { width: 1000 },
    })
    const data = parseContent(result)

    expect(data).toEqual(windowInfo)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows',
      payload: { width: 1000 },
    })
  })

  it('should open window with only height', async () => {
    const windowInfo = { id: 5, title: 'Kombuse', url: 'http://localhost:3333/' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(windowInfo),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'open_window',
      arguments: { height: 600 },
    })
    const data = parseContent(result)

    expect(data).toEqual(windowInfo)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows',
      payload: { height: 600 },
    })
  })

  it('should return error response when server returns error status', async () => {
    const injectable = createMockInjectable({
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create window' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'open_window', arguments: {} })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to open window')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Window creation failed')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'open_window', arguments: {} })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Window creation failed')
  })
})

describe('navigate_to', () => {
  it('should navigate window to path', async () => {
    const navResult = { id: 1, url: 'http://localhost:3333/projects/1/tickets/42' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(navResult),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'navigate_to',
      arguments: { window_id: 1, path: '/projects/1/tickets/42' },
    })
    const data = parseContent(result)

    expect(data).toEqual(navResult)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows/1/navigate',
      payload: { path: '/projects/1/tickets/42' },
    })
  })

  it('should interpolate window_id into URL', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ id: 5, url: 'http://localhost:3333/' }),
    })
    const { client } = await setupTestClient(injectable)

    await client.callTool({
      name: 'navigate_to',
      arguments: { window_id: 5, path: '/settings' },
    })

    expect(injectable.lastCall?.url).toBe('/api/desktop/windows/5/navigate')
  })

  it('should return error response when window not found (404)', async () => {
    const injectable = createMockInjectable({
      statusCode: 404,
      body: JSON.stringify({ error: 'Window not found' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'navigate_to',
      arguments: { window_id: 99, path: '/projects/1' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to navigate')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Network error')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'navigate_to',
      arguments: { window_id: 1, path: '/projects/1' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Network error')
  })
})

describe('take_screenshot', () => {
  it('should return image content block on success', async () => {
    const screenshotData = { data: 'iVBORw0KGgoAAAANSUhEUg==', mimeType: 'image/png' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(screenshotData),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'take_screenshot',
      arguments: { window_id: 1 },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageBlock = (result as any).content[0] as { type: string; data: string; mimeType: string }
    expect(imageBlock.type).toBe('image')
    expect(imageBlock.data).toBe('iVBORw0KGgoAAAANSUhEUg==')
    expect(imageBlock.mimeType).toBe('image/png')
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows/1/screenshot',
    })
  })

  it('should return error response when window not found (404)', async () => {
    const injectable = createMockInjectable({
      statusCode: 404,
      body: JSON.stringify({ error: 'Window not found' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'take_screenshot',
      arguments: { window_id: 99 },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to take screenshot')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Capture failed')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'take_screenshot',
      arguments: { window_id: 1 },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Capture failed')
  })

  it('should fail when inject returns non-JSON body', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: 'not-json-content',
    })
    const { client } = await setupTestClient(injectable)

    // Non-JSON body falls through to destructuring, producing undefined data/mimeType.
    // The MCP SDK rejects the malformed image content block at the protocol level.
    await expect(
      client.callTool({ name: 'take_screenshot', arguments: { window_id: 1 } })
    ).rejects.toThrow()
  })
})

describe('save_screenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should save screenshot to file and return path and size', async () => {
    const base64Data = Buffer.from('fake-png-data').toString('base64')
    const screenshotData = { data: base64Data, mimeType: 'image/png' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(screenshotData),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/Users/testuser/screenshots/test.png' },
    })
    const data = parseContent(result) as { file_path: string; size: number }

    expect(result.isError).toBeFalsy()
    expect(data.file_path).toBe('/Users/testuser/screenshots/test.png')
    expect(data.size).toBe(Buffer.from(base64Data, 'base64').length)
    expect(injectable.lastCall).toEqual({
      method: 'POST',
      url: '/api/desktop/windows/1/screenshot',
    })

    const { mkdirSync, writeFileSync } = await import('node:fs')
    expect(mkdirSync).toHaveBeenCalledWith('/Users/testuser/screenshots', { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      '/Users/testuser/screenshots/test.png',
      Buffer.from(base64Data, 'base64'),
    )
  })

  it('should return error response when server returns error status', async () => {
    const injectable = createMockInjectable({
      statusCode: 404,
      body: JSON.stringify({ error: 'Window not found' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 99, file_path: '/Users/testuser/test.png' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to capture screenshot')
  })

  it('should return error response when file write fails', async () => {
    const base64Data = Buffer.from('fake-png-data').toString('base64')
    const screenshotData = { data: base64Data, mimeType: 'image/png' }
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify(screenshotData),
    })
    const { client } = await setupTestClient(injectable)

    const { writeFileSync } = await import('node:fs')
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/Users/testuser/readonly/test.png' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to write file')
    expect(data.error).toContain('EACCES')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Connection refused')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/Users/testuser/test.png' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Connection refused')
  })

  it('should reject path traversal attempts', async () => {
    const base64Data = Buffer.from('fake-png-data').toString('base64')
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ data: base64Data, mimeType: 'image/png' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/Users/testuser/../../etc/passwd.png' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('file_path must be an absolute path within the home directory')
  })

  it('should reject paths outside home directory', async () => {
    const base64Data = Buffer.from('fake-png-data').toString('base64')
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ data: base64Data, mimeType: 'image/png' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/etc/screenshots/test.png' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('file_path must be an absolute path within the home directory')
  })

  it('should reject non-PNG file extensions', async () => {
    const base64Data = Buffer.from('fake-png-data').toString('base64')
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ data: base64Data, mimeType: 'image/png' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'save_screenshot',
      arguments: { window_id: 1, file_path: '/Users/testuser/test.jpg' },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('file_path must end with .png')
  })
})

describe('close_window', () => {
  it('should close window and return success', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'close_window',
      arguments: { window_id: 1 },
    })
    const data = parseContent(result) as { success: boolean }

    expect(result.isError).toBeFalsy()
    expect(data.success).toBe(true)
    expect(injectable.lastCall).toEqual({
      method: 'DELETE',
      url: '/api/desktop/windows/1',
    })
  })

  it('should interpolate window_id into URL', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    })
    const { client } = await setupTestClient(injectable)

    await client.callTool({
      name: 'close_window',
      arguments: { window_id: 7 },
    })

    expect(injectable.lastCall?.url).toBe('/api/desktop/windows/7')
  })

  it('should return error response when window not found (404)', async () => {
    const injectable = createMockInjectable({
      statusCode: 404,
      body: JSON.stringify({ error: 'Window not found' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'close_window',
      arguments: { window_id: 99 },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Failed to close window')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Network error')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'close_window',
      arguments: { window_id: 1 },
    })
    const data = parseContent(result) as { error: string }

    expect(result.isError).toBe(true)
    expect(data.error).toContain('Network error')
  })
})
