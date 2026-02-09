import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '@kombuse/persistence/test-utils'
import { ticketsRepository, projectsRepository, labelsRepository } from '@kombuse/persistence'
import { registerTicketTools } from '../index'

let cleanup: () => void
let client: Client

async function setupTestClient() {
  const server = new McpServer({ name: 'test', version: '0.0.1' })
  registerTicketTools(server)

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.server.connect(serverTransport)

  const c = new Client({ name: 'test-client', version: '0.0.1' })
  await c.connect(clientTransport)

  return c
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseContent(result: any): unknown {
  const textBlock = result.content[0] as { type: string; text: string }
  return JSON.parse(textBlock.text)
}

beforeEach(async () => {
  const setup = setupTestDb()
  cleanup = setup.cleanup
  client = await setupTestClient()
})

afterEach(() => {
  cleanup()
})

describe('list_tickets', () => {
  it('should return empty array when no tickets exist', async () => {
    const result = await client.callTool({ name: 'list_tickets', arguments: {} })
    const data = parseContent(result) as { tickets: unknown[]; count: number }

    expect(data.tickets).toEqual([])
    expect(data.count).toBe(0)
  })

  it('should return tickets for a project', async () => {
    ticketsRepository.create({
      title: 'Ticket A',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketsRepository.create({
      title: 'Ticket B',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { project_id: TEST_PROJECT_ID },
    })
    const data = parseContent(result) as { tickets: { title: string }[]; count: number }

    expect(data.count).toBe(2)
    expect(data.tickets.map((t) => t.title)).toContain('Ticket A')
    expect(data.tickets.map((t) => t.title)).toContain('Ticket B')
  })

  it('should filter by status', async () => {
    ticketsRepository.create({
      title: 'Open ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      status: 'open',
    })
    ticketsRepository.create({
      title: 'Closed ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      status: 'closed',
    })

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { status: 'open' },
    })
    const data = parseContent(result) as { tickets: { title: string }[]; count: number }

    expect(data.count).toBe(1)
    expect(data.tickets[0]!.title).toBe('Open ticket')
  })

  it('should respect limit and offset', async () => {
    for (let i = 1; i <= 5; i++) {
      ticketsRepository.create({
        title: `Ticket ${i}`,
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
    }

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { limit: 2, offset: 0 },
    })
    const data = parseContent(result) as { tickets: unknown[]; count: number }

    expect(data.count).toBe(2)
  })
})

describe('search_tickets', () => {
  it('should find tickets by title', async () => {
    ticketsRepository.create({
      title: 'Fix authentication bug',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketsRepository.create({
      title: 'Add dark mode',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'search_tickets',
      arguments: { query: 'authentication' },
    })
    const data = parseContent(result) as { tickets: { title: string }[]; count: number }

    expect(data.count).toBe(1)
    expect(data.tickets[0]!.title).toBe('Fix authentication bug')
  })

  it('should find tickets by body', async () => {
    ticketsRepository.create({
      title: 'Bug report',
      body: 'The login page crashes when submitting empty credentials',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'search_tickets',
      arguments: { query: 'credentials' },
    })
    const data = parseContent(result) as { tickets: { title: string }[]; count: number }

    expect(data.count).toBe(1)
    expect(data.tickets[0]!.title).toBe('Bug report')
  })

  it('should return empty results for special-characters-only query', async () => {
    ticketsRepository.create({
      title: 'Some ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'search_tickets',
      arguments: { query: '***' },
    })
    const data = parseContent(result) as { tickets: unknown[]; count: number }

    expect(data.tickets).toEqual([])
    expect(data.count).toBe(0)
  })

  it('should scope search to a project', async () => {
    const otherProject = projectsRepository.create({
      name: 'Other Project',
      owner_id: TEST_USER_ID,
    })

    ticketsRepository.create({
      title: 'Performance optimization',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketsRepository.create({
      title: 'Performance monitoring',
      project_id: otherProject.id,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'search_tickets',
      arguments: { query: 'performance', project_id: TEST_PROJECT_ID },
    })
    const data = parseContent(result) as { tickets: { title: string }[]; count: number }

    expect(data.count).toBe(1)
    expect(data.tickets[0]!.title).toBe('Performance optimization')
  })
})

describe('list_projects', () => {
  it('should return seeded project', async () => {
    const result = await client.callTool({ name: 'list_projects', arguments: {} })
    const data = parseContent(result) as { projects: { id: string }[]; count: number }

    expect(data.count).toBeGreaterThanOrEqual(1)
    expect(data.projects.some((p) => p.id === TEST_PROJECT_ID)).toBe(true)
  })

  it('should search projects by name', async () => {
    projectsRepository.create({
      name: 'Alpha Service',
      owner_id: TEST_USER_ID,
    })
    projectsRepository.create({
      name: 'Beta Platform',
      owner_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'list_projects',
      arguments: { search: 'Alpha' },
    })
    const data = parseContent(result) as { projects: { name: string }[]; count: number }

    expect(data.count).toBe(1)
    expect(data.projects[0]!.name).toBe('Alpha Service')
  })

  it('should respect pagination', async () => {
    for (let i = 0; i < 5; i++) {
      projectsRepository.create({
        name: `Project ${i}`,
        owner_id: TEST_USER_ID,
      })
    }

    const result = await client.callTool({
      name: 'list_projects',
      arguments: { limit: 2 },
    })
    const data = parseContent(result) as { projects: unknown[]; count: number }

    expect(data.count).toBe(2)
  })
})

describe('list_labels', () => {
  it('should return labels for a project', async () => {
    labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug', color: '#ef4444' })
    labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Feature', color: '#3b82f6' })

    const result = await client.callTool({
      name: 'list_labels',
      arguments: { project_id: TEST_PROJECT_ID },
    })
    const data = parseContent(result) as { labels: { name: string }[] }

    expect(data.labels).toHaveLength(2)
    expect(data.labels.map((l) => l.name)).toContain('Bug')
    expect(data.labels.map((l) => l.name)).toContain('Feature')
  })

  it('should return empty array for project with no labels', async () => {
    const result = await client.callTool({
      name: 'list_labels',
      arguments: { project_id: TEST_PROJECT_ID },
    })
    const data = parseContent(result) as { labels: unknown[] }

    expect(data.labels).toEqual([])
  })
})

describe('update_ticket', () => {
  it('should return error for non-existent ticket', async () => {
    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: 9999, status: 'closed' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('9999')
  })

  it('should update ticket status', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'in_progress' },
    })
    const data = parseContent(result) as { ticket: { id: number; status: string }; labels: unknown[] }

    expect(data.ticket.id).toBe(ticket.id)
    expect(data.ticket.status).toBe('in_progress')
  })

  it('should add labels to a ticket', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug' })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, add_label_ids: [label.id] },
    })
    const data = parseContent(result) as { ticket: { id: number }; labels: { id: number; name: string }[] }

    expect(data.labels).toHaveLength(1)
    expect(data.labels[0]!.name).toBe('Bug')
  })

  it('should remove labels from a ticket', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug' })
    labelsRepository.addToTicket(ticket.id, label.id)

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, remove_label_ids: [label.id] },
    })
    const data = parseContent(result) as { ticket: { id: number }; labels: unknown[] }

    expect(data.labels).toHaveLength(0)
  })

  it('should update multiple fields and labels in one call', async () => {
    const ticket = ticketsRepository.create({
      title: 'Original title',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const labelBug = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug' })
    const labelFeature = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Feature' })
    labelsRepository.addToTicket(ticket.id, labelBug.id)

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        ticket_id: ticket.id,
        title: 'Updated title',
        status: 'closed',
        add_label_ids: [labelFeature.id],
        remove_label_ids: [labelBug.id],
      },
    })
    const data = parseContent(result) as {
      ticket: { title: string; status: string }
      labels: { name: string }[]
    }

    expect(data.ticket.title).toBe('Updated title')
    expect(data.ticket.status).toBe('closed')
    expect(data.labels).toHaveLength(1)
    expect(data.labels[0]!.name).toBe('Feature')
  })

  it('should handle idempotent label add', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug' })
    labelsRepository.addToTicket(ticket.id, label.id)

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, add_label_ids: [label.id] },
    })
    const data = parseContent(result) as { labels: { name: string }[] }

    expect(result.isError).toBeFalsy()
    expect(data.labels).toHaveLength(1)
    expect(data.labels[0]!.name).toBe('Bug')
  })

  it('should update priority', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, priority: 3 },
    })
    const data = parseContent(result) as { ticket: { priority: number } }

    expect(data.ticket.priority).toBe(3)
  })

  it('should unassign via assignee_id null', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketsRepository.update(ticket.id, { assignee_id: TEST_USER_ID })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, assignee_id: null },
    })
    const data = parseContent(result) as { ticket: { assignee_id: string | null } }

    expect(data.ticket.assignee_id).toBeNull()
  })
})
