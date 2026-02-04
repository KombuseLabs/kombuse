import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ticketsRepository, commentsRepository } from '@kombuse/persistence'
import type { Ticket, Comment } from '@kombuse/types'
import { z } from 'zod'

/**
 * Response type for get_ticket tool
 */
interface TicketWithComments {
  ticket: Ticket
  comments: Comment[]
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
        author_id: z.string().min(1).describe('The ID of the comment author. Use "anonymous-agent" if no profile exists.'),
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
      },
    },
    async ({ ticket_id, author_id, body, parent_id }) => {
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

      const comment = commentsRepository.create({
        ticket_id,
        author_id,
        body,
        parent_id,
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

  // Tool 3: update_comment
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
