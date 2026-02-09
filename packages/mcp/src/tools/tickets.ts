import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ticketsRepository, projectsRepository, commentsRepository, attachmentsRepository, agentInvocationsRepository } from '@kombuse/persistence'
import type { Ticket, Project, CommentWithAuthorAndAttachments } from '@kombuse/types'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { z } from 'zod'

/**
 * Response type for get_ticket tool
 */
interface TicketWithComments {
  ticket: Ticket
  comments: CommentWithAuthorAndAttachments[]
}

/**
 * Register all ticket-related MCP tools
 */
export function registerTicketTools(server: McpServer): void {
  // Tool 1: get_ticket
  server.registerTool(
    'get_ticket',
    {
      description:
        'Get a ticket by ID including all its comments. Returns the ticket details and an array of comments in chronological order. Each comment includes attachment metadata (filename, mime_type, size_bytes) if any files are attached.',
      inputSchema: {
        ticket_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the ticket to retrieve'),
      },
    },
    async ({ ticket_id }) => {
      const ticket = ticketsRepository.get(ticket_id)

      if (!ticket) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Ticket ${ticket_id} not found` }),
            },
          ],
          isError: true,
        }
      }

      const comments = commentsRepository.getByTicket(ticket_id)
      const attachmentsByComment = attachmentsRepository.getByTicketComments(ticket_id)

      const commentsWithAttachments: CommentWithAuthorAndAttachments[] = comments.map((comment) => ({
        ...comment,
        attachments: (attachmentsByComment[comment.id] ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
        })),
      }))

      const result: TicketWithComments = {
        ticket,
        comments: commentsWithAttachments,
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    }
  )

  // Tool 2: add_comment
  server.registerTool(
    'add_comment',
    {
      description:
        'Add a comment to a ticket. The comment body supports @profile and #ticket mentions which are automatically parsed. Returns the created comment.',
      inputSchema: {
        ticket_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the ticket to comment on'),
        body: z
          .string()
          .min(1)
          .describe('The comment text (supports @profile and #ticket mentions)'),
        parent_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional parent comment ID for replies'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID linking this comment to the agent session that created it'),
      },
    },
    async ({ ticket_id, body, parent_id, kombuse_session_id }) => {
      // Verify ticket exists first
      const ticket = ticketsRepository.get(ticket_id)
      if (!ticket) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Ticket ${ticket_id} not found` }),
            },
          ],
          isError: true,
        }
      }

      // Resolve author from session — single source of truth
      let authorId = ANONYMOUS_AGENT_ID
      if (kombuse_session_id) {
        const invocations = agentInvocationsRepository.list({ kombuse_session_id })
        if (invocations.length > 0) {
          authorId = invocations[0]!.agent_id
        }
      }

      const comment = commentsRepository.create({
        ticket_id,
        author_id: authorId,
        body,
        parent_id,
        kombuse_session_id,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(comment, null, 2),
          },
        ],
      }
    }
  )

  // Tool 3: create_ticket
  server.registerTool(
    'create_ticket',
    {
      description:
        'Create a new ticket. Returns the created ticket.',
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe('The project ID to create the ticket in'),
        title: z
          .string()
          .min(1)
          .describe('The title of the ticket'),
        body: z
          .string()
          .optional()
          .describe('Optional body/description for the ticket'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID linking this ticket to the agent session that created it'),
      },
    },
    async ({ project_id, title, body, kombuse_session_id }) => {
      // Resolve author from session — single source of truth
      let authorId = ANONYMOUS_AGENT_ID
      if (kombuse_session_id) {
        const invocations = agentInvocationsRepository.list({ kombuse_session_id })
        if (invocations.length > 0) {
          authorId = invocations[0]!.agent_id
        }
      }

      const ticket = ticketsRepository.create({
        project_id,
        author_id: authorId,
        title,
        body,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(ticket, null, 2),
          },
        ],
      }
    }
  )

  // Tool 4: update_comment
  server.registerTool(
    'update_comment',
    {
      description:
        'Update an existing comment. Only the body can be updated. The comment will be marked as edited. Returns the updated comment.',
      inputSchema: {
        comment_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the comment to update'),
        body: z.string().min(1).describe('The new comment text'),
      },
    },
    async ({ comment_id, body }) => {
      const comment = commentsRepository.update(comment_id, { body })

      if (!comment) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Comment ${comment_id} not found` }),
            },
          ],
          isError: true,
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(comment, null, 2),
          },
        ],
      }
    }
  )

  // Tool 5: list_tickets
  server.registerTool(
    'list_tickets',
    {
      description:
        'List tickets with filtering and pagination. Returns tickets matching the specified filters, sorted by the chosen field. Use this to browse what\'s being worked on, find tickets by status or assignee, etc.',
      inputSchema: {
        project_id: z
          .string()
          .optional()
          .describe('Filter by project ID'),
        status: z
          .enum(['open', 'closed', 'in_progress', 'blocked'])
          .optional()
          .describe('Filter by ticket status'),
        assignee_id: z
          .string()
          .optional()
          .describe('Filter by assignee profile ID'),
        label_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe('Filter by label IDs (all specified labels must match)'),
        sort_by: z
          .enum(['created_at', 'updated_at', 'last_activity_at'])
          .optional()
          .describe('Field to sort by (default: updated_at)'),
        sort_order: z
          .enum(['asc', 'desc'])
          .optional()
          .describe('Sort direction (default: desc)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of tickets to return (default: 50, max: 100)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of tickets to skip for pagination (default: 0)'),
      },
    },
    async ({ project_id, status, assignee_id, label_ids, sort_by, sort_order, limit, offset }) => {
      const tickets = ticketsRepository.list({
        project_id,
        status,
        assignee_id,
        label_ids,
        sort_by: sort_by ?? 'updated_at',
        sort_order: sort_order ?? 'desc',
        limit: limit ?? 50,
        offset: offset ?? 0,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ tickets, count: tickets.length }, null, 2),
          },
        ],
      }
    }
  )

  // Tool 6: search_tickets
  server.registerTool(
    'search_tickets',
    {
      description:
        'Full-text search across ticket titles and bodies. Results are ranked by relevance. Use this to find related work, duplicates, and prior art before creating new tickets.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Search query (full-text, supports stemming e.g. "run" matches "running")'),
        project_id: z
          .string()
          .optional()
          .describe('Scope search to a specific project'),
        status: z
          .enum(['open', 'closed', 'in_progress', 'blocked'])
          .optional()
          .describe('Filter results by ticket status'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of results (default: 20, max: 100)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of results to skip for pagination (default: 0)'),
      },
    },
    async ({ query, project_id, status, limit, offset }) => {
      const tickets = ticketsRepository.list({
        search: query,
        project_id,
        status,
        limit: limit ?? 20,
        offset: offset ?? 0,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ tickets, count: tickets.length }, null, 2),
          },
        ],
      }
    }
  )

  // Tool 7: list_projects
  server.registerTool(
    'list_projects',
    {
      description:
        'List available projects. Use this to discover projects in the workspace so you can work across them.',
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe('Search projects by name or description'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of projects to return (default: 50, max: 100)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of projects to skip for pagination (default: 0)'),
      },
    },
    async ({ search, limit, offset }) => {
      const projects = projectsRepository.list({
        search,
        limit: limit ?? 50,
        offset: offset ?? 0,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ projects, count: projects.length }, null, 2),
          },
        ],
      }
    }
  )
}
