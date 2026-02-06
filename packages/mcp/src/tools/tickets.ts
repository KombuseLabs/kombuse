import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ticketsRepository, commentsRepository, agentInvocationsRepository } from '@kombuse/persistence'
import type { Ticket, CommentWithAuthor } from '@kombuse/types'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { z } from 'zod'

/**
 * Response type for get_ticket tool
 */
interface TicketWithComments {
  ticket: Ticket
  comments: CommentWithAuthor[]
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
        'Get a ticket by ID including all its comments. Returns the ticket details and an array of comments in chronological order.',
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

      const result: TicketWithComments = {
        ticket,
        comments,
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
}
