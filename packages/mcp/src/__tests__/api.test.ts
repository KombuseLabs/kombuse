import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerApiTools, type InjectableServer, type ApiRouteInfo } from '../index'

const TEST_ROUTES: ApiRouteInfo[] = [
  { method: 'GET', path: '/api/tickets' },
  { method: 'GET', path: '/api/tickets/:id' },
  { method: 'POST', path: '/api/tickets' },
  { method: 'GET', path: '/api/projects' },
  { method: 'PATCH', path: '/api/tickets/:id' },
  { method: 'DELETE', path: '/api/tickets/:id' },
]

function createMockInjectable(
  response: { statusCode: number; body: string } = { statusCode: 200, body: '{"ok":true}' }
): InjectableServer & { lastCall: { method: string; url: string } | null } {
  const mock = {
    lastCall: null as { method: string; url: string } | null,
    async inject(opts: { method: string; url: string }) {
      mock.lastCall = opts
      return response
    },
  }
  return mock
}

async function setupTestClient(
  injectable: InjectableServer,
  routes: ApiRouteInfo[] = TEST_ROUTES
) {
  const server = new McpServer({ name: 'test', version: '0.0.1' })
  registerApiTools(server, injectable, routes)

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

describe('list_api_endpoints', () => {
  it('should return all routes when no filter is provided', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({ name: 'list_api_endpoints', arguments: {} })
    const data = parseContent(result) as { endpoints: ApiRouteInfo[]; total: number }

    expect(data.total).toBe(TEST_ROUTES.length)
    expect(data.endpoints).toEqual(TEST_ROUTES)
  })

  it('should filter by method', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'list_api_endpoints',
      arguments: { method: 'GET' },
    })
    const data = parseContent(result) as { endpoints: ApiRouteInfo[]; total: number }

    expect(data.total).toBe(3)
    expect(data.endpoints.every((e) => e.method === 'GET')).toBe(true)
  })

  it('should return empty array when no routes match filter', async () => {
    const injectable = createMockInjectable()
    const routes: ApiRouteInfo[] = [{ method: 'GET', path: '/api/tickets' }]
    const { client } = await setupTestClient(injectable, routes)

    const result = await client.callTool({
      name: 'list_api_endpoints',
      arguments: { method: 'DELETE' },
    })
    const data = parseContent(result) as { endpoints: ApiRouteInfo[]; total: number }

    expect(data.total).toBe(0)
    expect(data.endpoints).toEqual([])
  })

  it('should return empty array when routes list is empty', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable, [])

    const result = await client.callTool({ name: 'list_api_endpoints', arguments: {} })
    const data = parseContent(result) as { endpoints: ApiRouteInfo[]; total: number }

    expect(data.total).toBe(0)
    expect(data.endpoints).toEqual([])
  })
})

describe('call_api', () => {
  it('should call the API and return parsed JSON response', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: JSON.stringify([{ id: 1, title: 'Test' }]),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/tickets' },
    })
    const data = parseContent(result) as { status: number; body: unknown }

    expect(data.status).toBe(200)
    expect(data.body).toEqual([{ id: 1, title: 'Test' }])
    expect(injectable.lastCall).toEqual({ method: 'GET', url: '/api/tickets' })
  })

  it('should reject paths not starting with /api/', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/health' },
    })
    const data = parseContent(result) as { error: string }

    expect(data.error).toContain('Path must start with /api/')
    expect(result.isError).toBe(true)
    expect(injectable.lastCall).toBeNull()
  })

  it('should reject path traversal attempts', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/../mcp' },
    })
    const data = parseContent(result) as { error: string }

    expect(data.error).toContain('Path must start with /api/')
    expect(result.isError).toBe(true)
    expect(injectable.lastCall).toBeNull()
  })

  it('should serialize query parameters', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/tickets', query: { status: 'open', limit: '10' } },
    })

    expect(injectable.lastCall?.url).toBe('/api/tickets?status=open&limit=10')
  })

  it('should not append query string when query is omitted', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/tickets' },
    })

    expect(injectable.lastCall?.url).toBe('/api/tickets')
  })

  it('should always use GET method', async () => {
    const injectable = createMockInjectable()
    const { client } = await setupTestClient(injectable)

    await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/tickets' },
    })

    expect(injectable.lastCall?.method).toBe('GET')
  })

  it('should fall back to raw string for non-JSON responses', async () => {
    const injectable = createMockInjectable({
      statusCode: 200,
      body: 'not-json-content',
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/attachments/1/download' },
    })
    const data = parseContent(result) as { status: number; body: string }

    expect(data.status).toBe(200)
    expect(data.body).toBe('not-json-content')
  })

  it('should return error response when inject throws', async () => {
    const injectable: InjectableServer = {
      async inject() {
        throw new Error('Connection refused')
      },
    }
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/tickets' },
    })
    const data = parseContent(result) as { error: string }

    expect(data.error).toContain('Connection refused')
    expect(result.isError).toBe(true)
  })

  it('should pass through non-200 status codes', async () => {
    const injectable = createMockInjectable({
      statusCode: 404,
      body: JSON.stringify({ message: 'Route GET:/api/unknown not found' }),
    })
    const { client } = await setupTestClient(injectable)

    const result = await client.callTool({
      name: 'call_api',
      arguments: { path: '/api/unknown' },
    })
    const data = parseContent(result) as { status: number; body: { message: string } }

    expect(data.status).toBe(404)
    expect(data.body.message).toContain('not found')
  })
})
