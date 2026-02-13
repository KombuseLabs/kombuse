import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ticketsRepository, projectsRepository, commentsRepository, attachmentsRepository, agentInvocationsRepository, labelsRepository, agentsRepository } from '@kombuse/persistence'
import type { Ticket, Project, Label, CommentWithAuthorAndAttachments, UpdateTicketInput, Agent, AgentInvocation, PermissionCheckRequest, PermissionCheckResult, PermissionContext, Attachment } from '@kombuse/types'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { agentService, fileStorage } from '@kombuse/services'
import { z } from 'zod'
import { existsSync, readFileSync } from 'fs'

const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   // 5 MB per image
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024  // 20 MB total

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

interface ImageCollectionResult {
  blocks: ContentBlock[]
  totalBytes: number
  skippedImages: string[]
}

function collectImageBlocks(
  attachments: Attachment[],
  sourceLabel: string,
  runningTotalBytes: number
): ImageCollectionResult {
  const blocks: ContentBlock[] = []
  let totalBytes = runningTotalBytes
  const skippedImages: string[] = []

  for (const attachment of attachments) {
    if (!(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(attachment.mime_type)) {
      continue
    }

    if (attachment.size_bytes > MAX_IMAGE_SIZE_BYTES) {
      skippedImages.push(`${attachment.filename} (${sourceLabel}): exceeds ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB limit`)
      continue
    }

    if (totalBytes + attachment.size_bytes > MAX_TOTAL_IMAGE_BYTES) {
      skippedImages.push(`${attachment.filename} (${sourceLabel}): would exceed ${MAX_TOTAL_IMAGE_BYTES / 1024 / 1024}MB total limit`)
      continue
    }

    const absolutePath = fileStorage.getAbsolutePath(attachment.storage_path)
    if (!existsSync(absolutePath)) {
      skippedImages.push(`${attachment.filename} (${sourceLabel}): file not found on disk`)
      continue
    }

    const buffer = readFileSync(absolutePath)
    const base64Data = buffer.toString('base64')
    totalBytes += buffer.length

    blocks.push({
      type: 'text' as const,
      text: `Image from ${sourceLabel}: ${attachment.filename} (id: ${attachment.id})`,
    })

    blocks.push({
      type: 'image' as const,
      data: base64Data,
      mimeType: attachment.mime_type,
    })
  }

  return { blocks, totalBytes, skippedImages }
}

/**
 * Resolve the agent and invocation context from a kombuse_session_id.
 * Returns null if no session ID provided (non-agent callers pass through).
 */
function resolveAgentContext(kombuse_session_id?: string): {
  agent: Agent
  invocation: AgentInvocation
} | null {
  if (!kombuse_session_id) return null

  const invocations = agentInvocationsRepository.list({ kombuse_session_id })
  if (invocations.length === 0) return null

  const invocation = invocations[0]!
  const agent = agentsRepository.get(invocation.agent_id)
  if (!agent) return null

  return { agent, invocation }
}

/**
 * Check if the resolved agent has permission for a given request.
 * If no agent context (non-agent caller), allows by default.
 */
function checkAgentPermission(
  agentContext: { agent: Agent; invocation: AgentInvocation } | null,
  request: PermissionCheckRequest
): PermissionCheckResult {
  if (!agentContext) {
    return { allowed: true }
  }

  const permissionContext: PermissionContext = {
    invocation: agentContext.invocation,
  }

  return agentService.checkPermission(agentContext.agent, request, permissionContext)
}

function permissionDeniedResponse(reason: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: `Permission denied: ${reason}` }),
      },
    ],
    isError: true,
  }
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
        'Get a ticket by ID including all its comments. Returns the ticket details and an array of comments in chronological order. Each comment includes attachment metadata (filename, mime_type, size_bytes, file_path) if any files are attached. Raster images (PNG, JPEG, GIF, WebP) are also returned as image content blocks with base64 data.',
      inputSchema: {
        ticket_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the ticket to retrieve'),
      },
    },
    async ({ ticket_id }) => {
      const ticket = ticketsRepository.getWithRelations(ticket_id)

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
      const ticketAttachments = attachmentsRepository.getByTicket(ticket_id)
      const attachmentsByComment = attachmentsRepository.getByTicketComments(ticket_id)

      const ticketAttachmentsMeta = ticketAttachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        file_path: fileStorage.getAbsolutePath(a.storage_path),
      }))

      const commentsWithAttachments = comments.map((comment) => ({
        ...comment,
        attachments: (attachmentsByComment[comment.id] ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          file_path: fileStorage.getAbsolutePath(a.storage_path),
        })),
      }))

      const result = {
        ticket,
        ticket_attachments: ticketAttachmentsMeta,
        comments: commentsWithAttachments,
      }

      const content: ContentBlock[] = [
        { type: 'text' as const, text: JSON.stringify(result, null, 2) },
      ]

      // Collect image content blocks from ticket description attachments
      const ticketImages = collectImageBlocks(ticketAttachments, 'ticket description', 0)
      content.push(...ticketImages.blocks)

      // Collect image content blocks from comment attachments
      let runningTotal = ticketImages.totalBytes
      const allSkipped = [...ticketImages.skippedImages]

      for (const comment of comments) {
        const commentAttachments = attachmentsByComment[comment.id] ?? []
        if (commentAttachments.length === 0) continue

        const commentImages = collectImageBlocks(
          commentAttachments,
          `comment #${comment.id}`,
          runningTotal
        )
        content.push(...commentImages.blocks)
        runningTotal = commentImages.totalBytes
        allSkipped.push(...commentImages.skippedImages)
      }

      // Add skipped images summary if any
      if (allSkipped.length > 0) {
        content.push({
          type: 'text' as const,
          text: `Note: ${allSkipped.length} image(s) skipped:\n${allSkipped.map(s => `- ${s}`).join('\n')}`,
        })
      }

      return { content }
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

      // Enforce permissions for agent callers
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        const result = checkAgentPermission(agentContext, {
          type: 'resource',
          resource: 'comment',
          action: 'create',
          resourceId: ticket_id,
          projectId: ticket.project_id,
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot add comments')
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
        triggers_enabled: z
          .boolean()
          .optional()
          .describe('Whether agent triggers are enabled for the ticket (default: false for MCP-created tickets)'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID linking this ticket to the agent session that created it'),
      },
    },
    async ({ project_id, title, body, triggers_enabled, kombuse_session_id }) => {
      // Resolve author from session — single source of truth
      let authorId = ANONYMOUS_AGENT_ID
      if (kombuse_session_id) {
        const invocations = agentInvocationsRepository.list({ kombuse_session_id })
        if (invocations.length > 0) {
          authorId = invocations[0]!.agent_id
        }
      }

      // Enforce permissions for agent callers
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        const result = checkAgentPermission(agentContext, {
          type: 'resource',
          resource: 'ticket',
          action: 'create',
          projectId: project_id,
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot create tickets')
        }
      }

      const ticket = ticketsRepository.create({
        project_id,
        author_id: authorId,
        title,
        body,
        triggers_enabled: triggers_enabled ?? false,
      })

      const ticketWithRelations = ticketsRepository.getWithRelations(ticket.id)

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(ticketWithRelations, null, 2),
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
      const tickets = ticketsRepository.listWithRelations({
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
        'Full-text search across ticket titles, bodies, and comments. Results are ranked by relevance, with direct ticket matches prioritized over comment matches. Use this to find related work, duplicates, and prior art before creating new tickets.',
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
      // Guard: if query contains only special characters, FTS sanitization
      // returns null and the repository silently skips the search filter.
      // Return empty results instead of an unfiltered list.
      const stripped = query.replace(/["()*^{}\s]/g, '')
      if (stripped.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ tickets: [], count: 0 }, null, 2),
            },
          ],
        }
      }

      const tickets = ticketsRepository.listWithRelations({
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

  // Tool 8: list_labels
  server.registerTool(
    'list_labels',
    {
      description:
        'List all labels for a project. Use this to discover available labels before adding them to tickets via update_ticket.',
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe('The project ID to list labels for'),
      },
    },
    async ({ project_id }) => {
      const labels = labelsRepository.getByProject(project_id)

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ labels }, null, 2),
          },
        ],
      }
    }
  )

  // Tool 9: update_ticket
  server.registerTool(
    'update_ticket',
    {
      description:
        'Update a ticket. Can change title, body, status, priority, assignee, and add/remove labels — all in a single call. Returns the updated ticket with its current labels.',
      inputSchema: {
        ticket_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the ticket to update'),
        title: z
          .string()
          .min(1)
          .optional()
          .describe('New title for the ticket'),
        body: z
          .string()
          .optional()
          .describe('New body/description for the ticket'),
        status: z
          .enum(['open', 'closed', 'in_progress', 'blocked'])
          .optional()
          .describe('New status for the ticket'),
        priority: z
          .number()
          .int()
          .min(0)
          .max(4)
          .optional()
          .describe('New priority (0=lowest, 4=highest)'),
        assignee_id: z
          .string()
          .nullable()
          .optional()
          .describe('New assignee profile ID (null to unassign)'),
        add_label_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe('Label IDs to add to the ticket'),
        remove_label_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe('Label IDs to remove from the ticket'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID for actor resolution'),
      },
    },
    async ({ ticket_id, title, body, status, priority, assignee_id, add_label_ids, remove_label_ids, kombuse_session_id }) => {
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

      // Resolve actor from session — fall back to ANONYMOUS_AGENT_ID when session
      // is provided but doesn't resolve (we know it's an agent, just not which one)
      let actorId: string | undefined
      if (kombuse_session_id) {
        const invocations = agentInvocationsRepository.list({ kombuse_session_id })
        actorId = invocations.length > 0 ? invocations[0]!.agent_id : ANONYMOUS_AGENT_ID
      }

      // Enforce permissions for agent callers — check all sub-operations before mutating
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        if (status !== undefined) {
          const result = checkAgentPermission(agentContext, {
            type: 'resource',
            resource: 'ticket.status',
            action: 'update',
            resourceId: ticket_id,
            projectId: ticket.project_id,
          })
          if (!result.allowed) {
            return permissionDeniedResponse(result.reason ?? 'Cannot update ticket status')
          }
        }

        if (remove_label_ids && remove_label_ids.length > 0) {
          const result = checkAgentPermission(agentContext, {
            type: 'resource',
            resource: 'ticket.labels',
            action: 'delete',
            resourceId: ticket_id,
            projectId: ticket.project_id,
          })
          if (!result.allowed) {
            return permissionDeniedResponse(result.reason ?? 'Cannot remove ticket labels')
          }
        }

        if (add_label_ids && add_label_ids.length > 0) {
          const result = checkAgentPermission(agentContext, {
            type: 'resource',
            resource: 'ticket.labels',
            action: 'update',
            resourceId: ticket_id,
            projectId: ticket.project_id,
          })
          if (!result.allowed) {
            return permissionDeniedResponse(result.reason ?? 'Cannot add ticket labels')
          }
        }

        if (title !== undefined || body !== undefined || priority !== undefined || assignee_id !== undefined) {
          const result = checkAgentPermission(agentContext, {
            type: 'resource',
            resource: 'ticket',
            action: 'update',
            resourceId: ticket_id,
            projectId: ticket.project_id,
          })
          if (!result.allowed) {
            return permissionDeniedResponse(result.reason ?? 'Cannot update ticket fields')
          }
        }
      }

      // Update scalar fields if any provided
      const updateInput: UpdateTicketInput = {}
      if (title !== undefined) updateInput.title = title
      if (body !== undefined) updateInput.body = body
      if (status !== undefined) updateInput.status = status
      if (priority !== undefined) updateInput.priority = priority as UpdateTicketInput['priority']
      if (assignee_id !== undefined) updateInput.assignee_id = assignee_id

      if (Object.keys(updateInput).length > 0) {
        ticketsRepository.update(ticket_id, updateInput, actorId)
      }

      // Add labels
      if (add_label_ids) {
        for (const labelId of add_label_ids) {
          labelsRepository.addToTicket(ticket_id, labelId, actorId)
        }
      }

      // Remove labels
      if (remove_label_ids) {
        for (const labelId of remove_label_ids) {
          labelsRepository.removeFromTicket(ticket_id, labelId, actorId)
        }
      }

      // Return updated state
      const updatedTicket = ticketsRepository.getWithRelations(ticket_id)!

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(updatedTicket, null, 2),
          },
        ],
      }
    }
  )
}
