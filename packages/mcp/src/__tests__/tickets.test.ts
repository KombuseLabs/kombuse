import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '@kombuse/persistence/test-utils'
import { ticketsRepository, projectsRepository, labelsRepository, profilesRepository, agentsRepository, agentTriggersRepository, agentInvocationsRepository, commentsRepository, attachmentsRepository, eventsRepository, profileSettingsRepository } from '@kombuse/persistence'
import type { Permission } from '@kombuse/types'
import { MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY, DEFAULT_PREFERENCE_PROFILE_ID } from '@kombuse/services'
import { registerTicketTools } from '../index'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Smallest valid 1x1 pixel PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

let mockUploadsRoot: string

vi.mock('@kombuse/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kombuse/services')>()
  return {
    ...actual,
    fileStorage: {
      getAbsolutePath: vi.fn((storagePath: string) => {
        return join(mockUploadsRoot, storagePath)
      }),
    },
  }
})

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
  mockUploadsRoot = mkdtempSync(join(tmpdir(), 'kombuse-test-uploads-'))
  const setup = setupTestDb()
  cleanup = setup.cleanup
  client = await setupTestClient()
})

afterEach(() => {
  cleanup()
  rmSync(mockUploadsRoot, { recursive: true, force: true })
})

function countImageBlocks(result: any): number {
  const blocks = result.content as Array<{ type: string }>
  return blocks.filter((b) => b.type === 'image').length
}

function writeTestFile(storagePath: string, data: Buffer) {
  const parts = storagePath.split('/')
  const dir = join(mockUploadsRoot, ...parts.slice(0, -1))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(mockUploadsRoot, storagePath), data)
}

describe('get_ticket', () => {
  it('should return ticket with comments by default and no image sections', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({ name: 'get_ticket', arguments: { ticket_id: ticket.id } })
    const data = parseContent(result) as any

    expect(data.ticket.id).toBe(ticket.id)
    expect(data.ticket.author_id).toBe(TEST_USER_ID)
    expect(data.ticket.author).toBeDefined()
    expect(data.ticket.author.id).toBe(TEST_USER_ID)
    expect(data.ticket.author.type).toBe('user')
    expect(data.ticket.author.name).toBe('Test User')
    expect(data.ticket.assignee).toBeNull()
    expect(data.comments).toEqual([])
    expect(data.ticket_attachments).toBeUndefined()
    expect(data.comment_attachments).toBeUndefined()
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should return error for non-existent ticket', async () => {
    const result = await client.callTool({ name: 'get_ticket', arguments: { ticket_id: 9999 } })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('9999')
  })

  it('should return ticket image attachment metadata when config.images is true', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const storagePath = '2026/02/test-screenshot.png'
    writeTestFile(storagePath, TINY_PNG)
    attachmentsRepository.create({
      ticket_id: ticket.id,
      filename: 'screenshot.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: true } },
    })
    const data = parseContent(result) as any

    expect(data.ticket_attachments).toHaveLength(1)
    expect(data.ticket_attachments[0].filename).toBe('screenshot.png')
    expect(data.ticket_attachments[0].mime_type).toBe('image/png')
    expect(data.ticket_attachments[0].size_bytes).toBe(TINY_PNG.length)
    expect(data.ticket_attachments[0].file_path).toContain(storagePath)
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should return comment image attachment metadata in comments when both sections are enabled', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'See attached',
    })

    const storagePath = '2026/02/test-error.png'
    writeTestFile(storagePath, TINY_PNG)
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'error.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: true, comments: true } },
    })
    const data = parseContent(result) as any

    const commentData = data.comments.find((c: any) => c.id === comment.id)
    expect(commentData.attachments).toBeUndefined()
    expect(data.comment_attachments).toHaveLength(1)
    expect(data.comment_attachments[0].comment_id).toBe(comment.id)
    expect(data.comment_attachments[0].attachments).toHaveLength(1)
    expect(data.comment_attachments[0].attachments[0].filename).toBe('error.png')
    expect(data.comment_attachments[0].attachments[0].file_path).toContain(storagePath)
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should include overview participants by default', async () => {
    const ticket = ticketsRepository.create({
      title: 'Overview test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const analyzerId = `analyzer-${Date.now()}`
    profilesRepository.create({ id: analyzerId, type: 'agent', name: 'Analyzer', description: 'Investigates issues' })
    agentsRepository.create({
      id: analyzerId,
      name: 'Test Agent',
      description: 'Test',
      system_prompt: 'Analyze',
      permissions: [],
      config: { type: 'analyzer' },
    })

    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'User context',
    })
    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: analyzerId,
      body: 'Analyzer findings',
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id },
    })
    const data = parseContent(result) as any

    expect(data.overview).toBeDefined()
    expect(data.overview.total_comments).toBe(2)
    expect(data.overview.participant_count).toBe(2)
    const analyzer = data.overview.participants.find((p: any) => p.author_id === analyzerId)
    expect(analyzer.actor_type).toBe('agent')
    expect(analyzer.agent_type).toBe('analyzer')
  })

  it('should filter comments to user plus coder agents', async () => {
    const ticket = ticketsRepository.create({
      title: 'Filter test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const coderId = `coder-${Date.now()}`
    const analyzerId = `analyzer-${Date.now()}`
    profilesRepository.create({ id: coderId, type: 'agent', name: 'Coder' })
    profilesRepository.create({ id: analyzerId, type: 'agent', name: 'Analyzer' })
    agentsRepository.create({ id: coderId, name: 'Test Agent', description: 'Test', system_prompt: 'Code', permissions: [], config: { type: 'coder' } })
    agentsRepository.create({ id: analyzerId, name: 'Test Agent', description: 'Test', system_prompt: 'Analyze', permissions: [], config: { type: 'analyzer' } })

    commentsRepository.create({ ticket_id: ticket.id, author_id: TEST_USER_ID, body: 'user comment' })
    commentsRepository.create({ ticket_id: ticket.id, author_id: coderId, body: 'coder comment' })
    commentsRepository.create({ ticket_id: ticket.id, author_id: analyzerId, body: 'analyzer comment' })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        config: {
          overview: false,
          comments: true,
          comment_filters: {
            actor_types: ['user', 'agent'],
            agent_types: ['coder'],
          },
        },
      },
    })
    const data = parseContent(result) as any

    expect(data.comments).toHaveLength(2)
    const authorIds = new Set(data.comments.map((c: any) => c.author_id))
    expect(authorIds.has(TEST_USER_ID)).toBe(true)
    expect(authorIds.has(coderId)).toBe(true)
    expect(authorIds.has(analyzerId)).toBe(false)
  })

  it('should default comments to false for triage/orchestration callers', async () => {
    const ticket = ticketsRepository.create({
      title: 'Triage default test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Should be hidden by default for triage',
    })

    const triageId = `triage-${Date.now()}`
    const kombuseSessionId = `session-${triageId}`
    profilesRepository.create({ id: triageId, type: 'agent', name: 'Triage Bot' })
    agentsRepository.create({
      id: triageId,
      name: 'Test Agent',
      description: 'Test',
      system_prompt: 'Triage',
      permissions: [],
      config: { type: 'triage' },
    })
    const trigger = agentTriggersRepository.create({
      agent_id: triageId,
      event_type: 'ticket.created',
    })
    const invocation = agentInvocationsRepository.create({
      agent_id: triageId,
      trigger_id: trigger.id,
      context: {},
    })
    agentInvocationsRepository.update(invocation.id, { kombuse_session_id: kombuseSessionId })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        kombuse_session_id: kombuseSessionId,
      },
    })
    const data = parseContent(result) as any

    expect(data.comments).toBeUndefined()
    expect(data.overview.total_comments).toBe(1)
  })

  it('should return comments in newest-first order and page from newest', async () => {
    const ticket = ticketsRepository.create({
      title: 'Ordering test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const c1 = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'first',
    })
    const c2 = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'second',
    })
    const c3 = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'third',
    })

    const page1 = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        config: {
          overview: false,
          comments: true,
          comment_filters: { limit: 2, offset: 0, include_bodies: true },
        },
      },
    })
    const data1 = parseContent(page1) as any
    expect(data1.comments).toHaveLength(2)
    expect(data1.comments[0].id).toBe(c3.id)
    expect(data1.comments[1].id).toBe(c2.id)
    expect(data1.comments_page ?? data1.meta?.comments_page).toBeDefined()
    expect(data1.meta.comments_page.has_more).toBe(true)
    expect(data1.meta.comments_page.next_offset).toBe(2)

    const page2 = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        config: {
          overview: false,
          comments: true,
          comment_filters: { limit: 2, offset: 2, include_bodies: true },
        },
      },
    })
    const data2 = parseContent(page2) as any
    expect(data2.comments).toHaveLength(1)
    expect(data2.comments[0].id).toBe(c1.id)
    expect(data2.meta.comments_page.has_more).toBe(false)
    expect(data2.meta.comments_page.next_offset).toBeNull()
  })

  it('should enforce a hard 25k byte cap on response payload', async () => {
    const ticket = ticketsRepository.create({
      title: 'Cap test',
      body: 'X'.repeat(120_000),
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    for (let i = 0; i < 60; i += 1) {
      commentsRepository.create({
        ticket_id: ticket.id,
        author_id: TEST_USER_ID,
        body: `comment-${i}: ${'Y'.repeat(4000)}`,
      })
    }

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        config: {
          comments: true,
          overview: true,
          comment_filters: { include_bodies: true, max_body_chars: 4000, limit: 100 },
        },
      },
    })

    const textBlock = (result.content as Array<{ type: string; text?: string }>)[0]
    expect(textBlock?.type).toBe('text')
    const text = textBlock?.text ?? ''
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(25_000)
  })

  it('should allow forcing full untruncated payload when config.force_full is true', async () => {
    const ticket = ticketsRepository.create({
      title: 'Force full test',
      body: 'T'.repeat(20_000),
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: `full-comment-${'C'.repeat(12_000)}`,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: {
        ticket_id: ticket.id,
        config: {
          comments: true,
          overview: false,
          force_full: true,
          ticket_body_preview_chars: 32,
          comment_filters: {
            include_bodies: true,
            max_body_chars: 64,
            limit: 20,
          },
        },
      },
    })

    const textBlock = (result.content as Array<{ type: string; text?: string }>)[0]
    expect(textBlock?.type).toBe('text')
    const text = textBlock?.text ?? ''
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(25_000)

    const data = parseContent(result) as any
    expect(data.meta.cap_enforced).toBe(false)
    expect(data.meta.force_full).toBe(true)
    expect(data.meta.truncated).toBe(false)
    expect(data.ticket.body).toBe('T'.repeat(20_000))
    expect(data.ticket.body_preview_truncated).toBe(false)
    expect(data.comments[0].body).toContain('full-comment-')
    expect(data.comments[0].body.length).toBeGreaterThan(12_000)
    expect(data.comments[0].body_truncated).toBe(false)
  })

  it('should return comments only when config.images is false and config.comments is true', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Only comment text',
    })

    const storagePath = '2026/02/test-img.png'
    writeTestFile(storagePath, TINY_PNG)
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'secret.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: false, comments: true } },
    })
    const data = parseContent(result) as any

    const commentData = data.comments.find((c: any) => c.id === comment.id)
    expect(commentData).toBeDefined()
    expect(commentData.attachments).toBeUndefined()
    expect(data.ticket_attachments).toBeUndefined()
    expect(data.comment_attachments).toBeUndefined()
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should return images only when config.images is true and config.comments is false', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'See attached',
    })

    const storagePath = '2026/02/test-comment-img.jpeg'
    writeTestFile(storagePath, TINY_PNG)
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'comment-photo.jpeg',
      mime_type: 'image/jpeg',
      size_bytes: TINY_PNG.length,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })
    attachmentsRepository.create({
      ticket_id: ticket.id,
      filename: 'ticket-photo.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: '2026/02/ticket-photo.png',
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: true, comments: false } },
    })
    const data = parseContent(result) as any

    expect(data.comments).toBeUndefined()
    expect(data.ticket_attachments).toHaveLength(1)
    expect(data.ticket_attachments[0].filename).toBe('ticket-photo.png')
    expect(data.comment_attachments).toHaveLength(1)
    expect(data.comment_attachments[0].comment_id).toBe(comment.id)
    expect(data.comment_attachments[0].attachments).toHaveLength(1)
    expect(data.comment_attachments[0].attachments[0].filename).toBe('comment-photo.jpeg')
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should exclude non-image attachments from image metadata', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const storagePath = '2026/02/test-diagram.svg'
    writeTestFile(storagePath, Buffer.from('<svg></svg>'))
    attachmentsRepository.create({
      ticket_id: ticket.id,
      filename: 'diagram.svg',
      mime_type: 'image/svg+xml',
      size_bytes: 11,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })
    attachmentsRepository.create({
      ticket_id: ticket.id,
      filename: 'notes.txt',
      mime_type: 'text/plain',
      size_bytes: 10,
      storage_path: '2026/02/notes.txt',
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: true, comments: false } },
    })
    const data = parseContent(result) as any

    expect(countImageBlocks(result)).toBe(0)
    expect(data.ticket_attachments).toHaveLength(1)
    expect(data.ticket_attachments[0].filename).toBe('diagram.svg')
  })

  it('should not read files from disk when returning attachment metadata', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    // Create attachment record but don't write the file
    attachmentsRepository.create({
      ticket_id: ticket.id,
      filename: 'missing.png',
      mime_type: 'image/png',
      size_bytes: 1024,
      storage_path: '2026/02/nonexistent.png',
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { ticket_id: ticket.id, config: { images: true } },
    })
    const data = parseContent(result) as any

    expect(countImageBlocks(result)).toBe(0)
    expect(data.ticket_attachments).toHaveLength(1)
    expect(data.ticket_attachments[0].filename).toBe('missing.png')
    expect(data.ticket_attachments[0].file_path).toContain('2026/02/nonexistent.png')
  })
})

describe('get_ticket_comment', () => {
  it('should return a single comment payload', async () => {
    const ticket = ticketsRepository.create({
      title: 'Comment lookup test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Single comment payload',
    })

    const result = await client.callTool({
      name: 'get_ticket_comment',
      arguments: { comment_id: comment.id },
    })
    const data = parseContent(result) as any

    expect(data.id).toBe(comment.id)
    expect(data.ticket_id).toBe(ticket.id)
    expect(data.author_id).toBe(TEST_USER_ID)
    expect(data.author_name).toBeDefined()
    expect(data.body).toBe('Single comment payload')
    expect(data.body_truncated).toBe(false)
    expect(data.attachments).toBeUndefined()
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should return error for missing comment id', async () => {
    const result = await client.callTool({
      name: 'get_ticket_comment',
      arguments: { comment_id: 9999 },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('9999')
  })

  it('should not return attachment metadata when config.images is false', async () => {
    const ticket = ticketsRepository.create({
      title: 'Comment attachment test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'See attachment',
    })

    const storagePath = '2026/02/comment-only-image.png'
    writeTestFile(storagePath, TINY_PNG)
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'comment-only-image.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: storagePath,
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket_comment',
      arguments: { comment_id: comment.id, config: { images: false } },
    })
    const data = parseContent(result) as any

    expect(data.attachments).toBeUndefined()
    expect(countImageBlocks(result)).toBe(0)
  })

  it('should return only image attachment metadata when config.images is true', async () => {
    const ticket = ticketsRepository.create({
      title: 'Comment image filtering test',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'See files',
    })

    const imageStoragePath = '2026/02/comment-image.png'
    writeTestFile(imageStoragePath, TINY_PNG)
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'comment-image.png',
      mime_type: 'image/png',
      size_bytes: TINY_PNG.length,
      storage_path: imageStoragePath,
      uploaded_by_id: TEST_USER_ID,
    })
    attachmentsRepository.create({
      comment_id: comment.id,
      filename: 'comment-notes.txt',
      mime_type: 'text/plain',
      size_bytes: 12,
      storage_path: '2026/02/comment-notes.txt',
      uploaded_by_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'get_ticket_comment',
      arguments: { comment_id: comment.id, config: { images: true } },
    })
    const data = parseContent(result) as any

    expect(data.attachments).toHaveLength(1)
    expect(data.attachments[0].filename).toBe('comment-image.png')
    expect(data.attachments[0].mime_type).toBe('image/png')
    expect(data.attachments[0].file_path).toContain(imageStoragePath)
    expect(countImageBlocks(result)).toBe(0)
  })
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

describe('permission enforcement', () => {
  let agentCounter = 0

  /**
   * Create a test agent with the given permissions and return its kombuse_session_id.
   */
  function createTestAgentSession(
    permissions: Permission[],
    invocationContext: Record<string, unknown> = {}
  ): string {
    const id = `test-agent-${++agentCounter}-${Date.now()}`
    const sessionId = `session-${id}`

    profilesRepository.create({ id, type: 'agent', name: `Agent ${agentCounter}` })
    agentsRepository.create({ id, name: 'Test Agent', description: 'Test', system_prompt: 'Test agent', permissions })

    const trigger = agentTriggersRepository.create({
      agent_id: id,
      event_type: 'ticket.created',
    })
    const invocation = agentInvocationsRepository.create({
      agent_id: id,
      trigger_id: trigger.id,
      context: invocationContext,
    })
    agentInvocationsRepository.update(invocation.id, { kombuse_session_id: sessionId })

    return sessionId
  }

  // -- update_ticket --

  it('should allow non-agent callers (no kombuse_session_id) to update freely', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed' },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { status: string } }
    expect(data.ticket.status).toBe('closed')
  })

  it('should deny agents with empty permissions from updating tickets', async () => {
    const sessionId = createTestAgentSession([])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, title: 'New title', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow project-scoped ticket updates in the same project', async () => {
    const sessionId = createTestAgentSession(
      [{ type: 'resource', resource: 'ticket', actions: ['update'], scope: 'project' }],
      { project_id: TEST_PROJECT_ID }
    )
    const ticket = ticketsRepository.create({
      title: 'Scoped ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, title: 'Scoped update', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { title: string } }
    expect(data.ticket.title).toBe('Scoped update')
  })

  it('should deny project-scoped ticket updates across projects', async () => {
    const sessionId = createTestAgentSession(
      [{ type: 'resource', resource: 'ticket', actions: ['update'], scope: 'project' }],
      { project_id: TEST_PROJECT_ID }
    )
    const otherProject = projectsRepository.create({
      id: `proj-${Date.now()}`,
      name: 'Other Project',
      owner_id: TEST_USER_ID,
    })
    const otherTicket = ticketsRepository.create({
      title: 'Cross-project ticket',
      project_id: otherProject.id,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: otherTicket.id, title: 'Should fail', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow Code Reviewer to close a ticket', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket.status', actions: ['update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { status: string } }
    expect(data.ticket.status).toBe('closed')
  })

  it('should deny Coding Agent from closing a ticket (no ticket.status permission)', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['read', 'update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow Code Reviewer to remove labels', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket.labels', actions: ['delete'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Requires review' })
    labelsRepository.addToTicket(ticket.id, label.id)

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, remove_label_ids: [label.id], kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { labels: unknown[] }
    expect(data.labels).toHaveLength(0)
  })

  it('should deny Coding Agent from removing labels (no ticket.labels delete)', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket.labels', actions: ['update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Requires review' })
    labelsRepository.addToTicket(ticket.id, label.id)

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, remove_label_ids: [label.id], kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should deny mixed update when agent lacks status permission', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        ticket_id: ticket.id,
        title: 'New title',
        status: 'closed',
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
    // Verify no partial mutation occurred
    const unchanged = ticketsRepository.get(ticket.id)!
    expect(unchanged.title).toBe('Test ticket')
    expect(unchanged.status).toBe('open')
  })

  it('should allow agent with full permissions to update fields and status', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['update'], scope: 'global' },
      { type: 'resource', resource: 'ticket.status', actions: ['update'], scope: 'global' },
      { type: 'resource', resource: 'ticket.labels', actions: ['update', 'delete'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug' })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        ticket_id: ticket.id,
        title: 'Updated',
        status: 'closed',
        add_label_ids: [label.id],
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { title: string; status: string }; labels: { name: string }[] }
    expect(data.ticket.title).toBe('Updated')
    expect(data.ticket.status).toBe('closed')
    expect(data.labels).toHaveLength(1)
  })

  // -- add_comment --

  it('should deny agent without comment.create permission from adding comments', async () => {
    const sessionId = createTestAgentSession([])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'add_comment',
      arguments: { ticket_id: ticket.id, body: 'Hello', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow agent with comment.create permission to add comments', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'comment', actions: ['create'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'add_comment',
      arguments: { ticket_id: ticket.id, body: 'Review complete', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
  })

  // -- create_ticket --

  it('should deny agent without ticket.create permission from creating tickets', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['read'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { project_id: TEST_PROJECT_ID, title: 'New ticket', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow agent with ticket.create permission to create tickets', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['create'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { project_id: TEST_PROJECT_ID, title: 'New ticket', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as {
      title: string
      author_id: string
      author: { id: string; type: string; name: string }
      assignee: null
    }
    expect(data.title).toBe('New ticket')
    expect(data.author_id).toBe(data.author.id)
    expect(data.author.type).toBe('agent')
    expect(data.author.name.length).toBeGreaterThan(0)
    expect(data.assignee).toBeNull()
  })

  it('should default MCP create_ticket to triggers disabled', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['create'], scope: 'global' },
    ])
    const existingCreatedEvents = eventsRepository.list({ event_type: 'ticket.created' }).length

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { project_id: TEST_PROJECT_ID, title: 'MCP default no trigger', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { title: string; triggers_enabled: boolean }
    expect(data.title).toBe('MCP default no trigger')
    expect(data.triggers_enabled).toBe(false)
    const createdEvents = eventsRepository.list({ event_type: 'ticket.created' }).length
    expect(createdEvents).toBe(existingCreatedEvents)
  })

  it('should allow create_ticket to opt in and enable triggers', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['create'], scope: 'global' },
    ])
    const existingCreatedEvents = eventsRepository.list({ event_type: 'ticket.created' }).length

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: {
        project_id: TEST_PROJECT_ID,
        title: 'MCP explicit trigger',
        triggers_enabled: true,
        kombuse_session_id: sessionId,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { title: string; triggers_enabled: boolean }
    expect(data.title).toBe('MCP explicit trigger')
    expect(data.triggers_enabled).toBe(true)
    const createdEvents = eventsRepository.list({ event_type: 'ticket.created' }).length
    expect(createdEvents).toBe(existingCreatedEvents + 1)
  })

  it('should default loop_protection_enabled to true for MCP-created tickets', async () => {
    const sid = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['create'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { project_id: TEST_PROJECT_ID, title: 'MCP default loop protection', kombuse_session_id: sid },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { title: string; loop_protection_enabled: boolean }
    expect(data.title).toBe('MCP default loop protection')
    expect(data.loop_protection_enabled).toBe(true)
  })

  it('should allow create_ticket to disable loop protection', async () => {
    const sid = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['create'], scope: 'global' },
    ])

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: {
        project_id: TEST_PROJECT_ID,
        title: 'MCP no loop protection',
        loop_protection_enabled: false,
        kombuse_session_id: sid,
      },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { title: string; loop_protection_enabled: boolean }
    expect(data.title).toBe('MCP no loop protection')
    expect(data.loop_protection_enabled).toBe(false)
  })

  // -- update_comment --

  it('should allow non-agent callers (no kombuse_session_id) to update comments freely', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Original body',
    })

    const result = await client.callTool({
      name: 'update_comment',
      arguments: { comment_id: comment.id, body: 'Updated body' },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { body: string; is_edited: boolean }
    expect(data.body).toBe('Updated body')
    expect(data.is_edited).toBe(true)
  })

  it('should return error when updating non-existent comment', async () => {
    const result = await client.callTool({
      name: 'update_comment',
      arguments: { comment_id: 99999, body: 'New body' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('not found')
  })

  it('should deny agents without comment.update permission from updating comments', async () => {
    const sessionId = createTestAgentSession([])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Original',
    })

    const result = await client.callTool({
      name: 'update_comment',
      arguments: { comment_id: comment.id, body: 'Should fail', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow agent with comment.update permission to update comments', async () => {
    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'comment', actions: ['update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Original',
    })

    const result = await client.callTool({
      name: 'update_comment',
      arguments: { comment_id: comment.id, body: 'Agent updated', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { body: string }
    expect(data.body).toBe('Agent updated')
  })

  // -- anonymous write access setting --

  it('should deny anonymous update_ticket when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
    expect(data.error).toContain('Anonymous')
  })

  it('should deny anonymous create_ticket when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { project_id: TEST_PROJECT_ID, title: 'Should fail' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should deny anonymous add_comment when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'add_comment',
      arguments: { ticket_id: ticket.id, body: 'Should fail' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should deny anonymous update_comment when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Original',
    })

    const result = await client.callTool({
      name: 'update_comment',
      arguments: { comment_id: comment.id, body: 'Should fail' },
    })

    expect(result.isError).toBe(true)
    const data = parseContent(result) as { error: string }
    expect(data.error).toContain('Permission denied')
  })

  it('should allow anonymous writes when setting is explicitly allowed', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'allowed',
    })

    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed' },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { status: string } }
    expect(data.ticket.status).toBe('closed')
  })

  it('should still allow authenticated agents when anonymous write access is denied', async () => {
    if (!profilesRepository.get(DEFAULT_PREFERENCE_PROFILE_ID)) {
      profilesRepository.create({ id: DEFAULT_PREFERENCE_PROFILE_ID, type: 'user', name: 'Default User' })
    }
    profileSettingsRepository.upsert({
      profile_id: DEFAULT_PREFERENCE_PROFILE_ID,
      setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
      setting_value: 'denied',
    })

    const sessionId = createTestAgentSession([
      { type: 'resource', resource: 'ticket', actions: ['update'], scope: 'global' },
      { type: 'resource', resource: 'ticket.status', actions: ['update'], scope: 'global' },
    ])
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { ticket_id: ticket.id, status: 'closed', kombuse_session_id: sessionId },
    })

    expect(result.isError).toBeFalsy()
    const data = parseContent(result) as { ticket: { status: string } }
    expect(data.ticket.status).toBe('closed')
  })
})
