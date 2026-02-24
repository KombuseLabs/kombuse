import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ticketsRepository, projectsRepository, commentsRepository, attachmentsRepository, agentInvocationsRepository, labelsRepository, agentsRepository } from '@kombuse/persistence'
import type { Ticket, Project, Label, UpdateTicketInput, Attachment, CommentWithAuthor, CommentFilters } from '@kombuse/types'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import { fileStorage } from '@kombuse/services'
import { resolveAgentContext, checkAgentPermission, checkAnonymousWriteAccess, permissionDeniedResponse } from './shared-permissions.tool'
import { z } from 'zod/v3'

const MAX_GET_TICKET_RESPONSE_BYTES = 25_000
const DEFAULT_COMMENT_LIMIT = 20
const MAX_COMMENT_LIMIT = 100
const DEFAULT_COMMENT_BODY_CHARS = 400
const MAX_COMMENT_BODY_CHARS = 4_000
const DEFAULT_TICKET_BODY_PREVIEW_CHARS = 1_000
const TRIAGE_LIKE_AGENT_TYPES = new Set(['triage', 'orchestration'])

const getTicketCommentFiltersSchema = z.object({
  author_ids: z.array(z.string().min(1)).optional(),
  actor_types: z.array(z.enum(['user', 'agent'])).optional(),
  agent_types: z.array(z.string().min(1)).optional(),
  limit: z.number().int().positive().max(MAX_COMMENT_LIMIT).optional(),
  offset: z.number().int().nonnegative().optional(),
  include_bodies: z.boolean().optional(),
  max_body_chars: z.number().int().positive().max(MAX_COMMENT_BODY_CHARS).optional(),
}).optional()

const getTicketConfigSchema = z.object({
  images: z
    .boolean()
    .optional()
    .describe('Include image attachment metadata with file paths (default: false)'),
  comments: z
    .boolean()
    .optional()
    .describe('Include comments (default: false for triage/orchestration, true otherwise)'),
  overview: z
    .boolean()
    .optional()
    .describe('Include actor/participant overview (default: true)'),
  force_full: z
    .boolean()
    .optional()
    .describe('Force full, untruncated payload (bypasses hard-cap pruning and body truncation)'),
  comment_filters: getTicketCommentFiltersSchema,
  ticket_body_preview_chars: z
    .number()
    .int()
    .positive()
    .max(10_000)
    .optional()
    .describe('Max chars for ticket body preview (default: 1000)'),
}).optional()

const getTicketCommentConfigSchema = z.object({
  images: z
    .boolean()
    .optional()
    .describe('Include image attachment metadata with file paths (default: false)'),
}).optional()

interface GetTicketCommentFilters {
  authorIds: Set<string> | null
  actorTypes: Set<'user' | 'agent'> | null
  agentTypes: Set<string> | null
  limit: number
  offset: number
  includeBodies: boolean
  maxBodyChars: number
}

interface GetTicketPruneStats {
  commentsDropped: number
  commentAttachmentGroupsDropped: number
  ticketAttachmentsDropped: number
  overviewParticipantsDropped: number
  commentBodiesRemoved: boolean
}

interface GetTicketPruneResult {
  payload: Record<string, unknown>
  bytes: number
  truncated: boolean
  stats: GetTicketPruneStats
}

function getMetaObject(payload: Record<string, unknown>): Record<string, unknown> {
  if (
    payload.meta
    && typeof payload.meta === 'object'
    && !Array.isArray(payload.meta)
  ) {
    return payload.meta as Record<string, unknown>
  }

  const meta: Record<string, unknown> = {}
  payload.meta = meta
  return meta
}

function buildMinimalTicketFallbackPayload(
  ticket: unknown,
  maxBytes: number
): Record<string, unknown> {
  const normalizedTicket = (
    ticket
    && typeof ticket === 'object'
    && !Array.isArray(ticket)
  )
    ? ticket as Record<string, unknown>
    : {}

  return {
    ticket: {
      id: normalizedTicket.id ?? null,
      ticket_number: normalizedTicket.ticket_number ?? null,
      project_id: normalizedTicket.project_id ?? null,
      title: normalizedTicket.title ?? null,
      status: normalizedTicket.status ?? null,
    },
    meta: {
      cap_bytes: maxBytes,
      truncated: true,
      fallback_minimal: true,
    },
  }
}

function serializeGetTicketPayloadWithinCap(
  payload: Record<string, unknown>,
  maxBytes: number
): string {
  let working = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let serialized = JSON.stringify(working)
    let bytes = utf8ByteLength(serialized)

    const meta = getMetaObject(working)
    meta.bytes_used = bytes
    serialized = JSON.stringify(working)
    bytes = utf8ByteLength(serialized)

    if (bytes <= maxBytes) {
      return serialized
    }

    const commentsPage = (
      meta.comments_page
      && typeof meta.comments_page === 'object'
      && !Array.isArray(meta.comments_page)
    )
      ? meta.comments_page as Record<string, unknown>
      : null

    // Drop optional diagnostic metadata first.
    if ('prune_stats' in meta) {
      delete meta.prune_stats
      continue
    }
    if (commentsPage && 'filters' in commentsPage) {
      delete commentsPage.filters
      continue
    }

    // If we still exceed cap, collapse to minimal payload.
    working = buildMinimalTicketFallbackPayload(working.ticket, maxBytes)
  }

  // Last-resort guaranteed-small payload.
  const fallback = buildMinimalTicketFallbackPayload(null, maxBytes)
  return JSON.stringify(fallback)
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { value, truncated: false }
  }
  if (maxChars <= 16) {
    return { value: value.slice(0, maxChars), truncated: true }
  }
  return { value: `${value.slice(0, maxChars - 16)}...[truncated]`, truncated: true }
}

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mime_type.startsWith('image/')
}

function toAttachmentMetaWithPath(attachment: Attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    file_path: fileStorage.getAbsolutePath(attachment.storage_path),
  }
}

function buildTicketSummary(
  ticket: NonNullable<ReturnType<typeof ticketsRepository._getInternalWithRelations>>,
  bodyPreviewChars: number,
  includeFullBody: boolean
) {
  const bodyPreview = ticket.body
    ? truncateText(ticket.body, bodyPreviewChars)
    : null

  const summary: Record<string, unknown> = {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    project_id: ticket.project_id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    author_id: ticket.author_id,
    assignee_id: ticket.assignee_id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    last_activity_at: ticket.last_activity_at,
    body_preview: bodyPreview?.value ?? null,
    body_preview_truncated: bodyPreview?.truncated ?? false,
    labels: ticket.labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    })),
    assignee: ticket.assignee
      ? {
        id: ticket.assignee.id,
        type: ticket.assignee.type,
        name: ticket.assignee.name,
      }
      : null,
    author: {
      id: ticket.author.id,
      type: ticket.author.type,
      name: ticket.author.name,
    },
  }

  if (includeFullBody) {
    summary.body = ticket.body ?? null
    summary.body_preview = ticket.body ?? null
    summary.body_preview_truncated = false
  }

  return summary
}

function parseGetTicketCommentFilters(
  config: z.infer<typeof getTicketConfigSchema>
): GetTicketCommentFilters {
  const filters = config?.comment_filters
  const authorIds = filters?.author_ids && filters.author_ids.length > 0
    ? new Set(filters.author_ids)
    : null
  const actorTypes = filters?.actor_types && filters.actor_types.length > 0
    ? new Set(filters.actor_types)
    : null
  const agentTypes = filters?.agent_types && filters.agent_types.length > 0
    ? new Set(filters.agent_types)
    : null

  return {
    authorIds,
    actorTypes,
    agentTypes,
    limit: filters?.limit ?? DEFAULT_COMMENT_LIMIT,
    offset: filters?.offset ?? 0,
    includeBodies: filters?.include_bodies ?? true,
    maxBodyChars: filters?.max_body_chars ?? DEFAULT_COMMENT_BODY_CHARS,
  }
}

function pruneGetTicketPayloadToHardCap(
  payload: Record<string, unknown>,
  maxBytes: number
): GetTicketPruneResult {
  const working = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  const stats: GetTicketPruneStats = {
    commentsDropped: 0,
    commentAttachmentGroupsDropped: 0,
    ticketAttachmentsDropped: 0,
    overviewParticipantsDropped: 0,
    commentBodiesRemoved: false,
  }

  const measure = () => utf8ByteLength(JSON.stringify(working))
  let bytes = measure()
  if (bytes <= maxBytes) {
    return { payload: working, bytes, truncated: false, stats }
  }

  const comments = Array.isArray(working.comments) ? working.comments as Array<Record<string, unknown>> : null
  if (comments) {
    for (const comment of comments) {
      if ('body' in comment) {
        delete comment.body
        comment.body_omitted = true
        stats.commentBodiesRemoved = true
      }
    }
    bytes = measure()
  }

  while (comments && comments.length > 0 && bytes > maxBytes) {
    comments.pop()
    stats.commentsDropped += 1
    bytes = measure()
  }

  const commentAttachments = Array.isArray(working.comment_attachments)
    ? working.comment_attachments as Array<unknown>
    : null
  while (commentAttachments && commentAttachments.length > 0 && bytes > maxBytes) {
    commentAttachments.pop()
    stats.commentAttachmentGroupsDropped += 1
    bytes = measure()
  }

  const ticketAttachments = Array.isArray(working.ticket_attachments)
    ? working.ticket_attachments as Array<unknown>
    : null
  while (ticketAttachments && ticketAttachments.length > 0 && bytes > maxBytes) {
    ticketAttachments.pop()
    stats.ticketAttachmentsDropped += 1
    bytes = measure()
  }

  const overview = (
    working.overview
    && typeof working.overview === 'object'
    && !Array.isArray(working.overview)
  )
    ? working.overview as Record<string, unknown>
    : null

  const participants = overview && Array.isArray(overview.participants)
    ? overview.participants as Array<Record<string, unknown>>
    : null

  if (participants && bytes > maxBytes) {
    for (const participant of participants) {
      if ('description' in participant) {
        delete participant.description
      }
    }
    bytes = measure()
  }

  while (participants && participants.length > 0 && bytes > maxBytes) {
    participants.pop()
    stats.overviewParticipantsDropped += 1
    bytes = measure()
  }

  const ticket = (
    working.ticket
    && typeof working.ticket === 'object'
    && !Array.isArray(working.ticket)
  )
    ? working.ticket as Record<string, unknown>
    : null
  if (ticket && bytes > maxBytes) {
    delete ticket.body_preview
    delete ticket.body_preview_truncated
    bytes = measure()
  }

  if (bytes > maxBytes) {
    const minimal = (
      payload.ticket
      && typeof payload.ticket === 'object'
      && !Array.isArray(payload.ticket)
    )
      ? payload.ticket as Record<string, unknown>
      : {}

    const fallback = {
      ticket: {
        id: minimal.id ?? null,
        project_id: minimal.project_id ?? null,
        title: minimal.title ?? null,
        status: minimal.status ?? null,
      },
      meta: {
        cap_bytes: maxBytes,
        truncated: true,
        fallback_minimal: true,
      },
    }

    return {
      payload: fallback,
      bytes: utf8ByteLength(JSON.stringify(fallback)),
      truncated: true,
      stats,
    }
  }

  return {
    payload: working,
    bytes,
    truncated: true,
    stats,
  }
}

function serializeGetTicketPayloadWithoutCap(payload: Record<string, unknown>): string {
  const working = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  const meta = getMetaObject(working)

  let serialized = JSON.stringify(working)
  meta.bytes_used = utf8ByteLength(serialized)
  serialized = JSON.stringify(working)
  meta.bytes_used = utf8ByteLength(serialized)

  return JSON.stringify(working)
}

/**
 * Register all ticket-related MCP tools
 */
export function registerTicketTools(server: McpServer): void {
  const registerTool = (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool.bind(server) as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => void

  // Tool 1: get_ticket
  registerTool(
    'get_ticket',
    {
      description:
        'Get a ticket by ID with a hard byte cap (25,000 UTF-8 bytes). Supports overview, filtered comments, and image attachment metadata (file paths only).',
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe('The project ID'),
        ticket_number: z
          .number()
          .int()
          .positive()
          .describe('The per-project ticket number'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional caller session ID for caller-aware defaults'),
        config: getTicketConfigSchema
          .describe('Optional sections and comment filters'),
      },
    },
    async ({ project_id, ticket_number, kombuse_session_id, config }) => {
      const agentContext = resolveAgentContext(kombuse_session_id)
      const callerAgentType = typeof agentContext?.agent.config?.type === 'string'
        ? agentContext.agent.config.type
        : undefined
      const isTriageLikeCaller = callerAgentType
        ? TRIAGE_LIKE_AGENT_TYPES.has(callerAgentType)
        : false

      const includeOverview = config?.overview ?? true
      const includeImages = config?.images ?? false
      const includeComments = config?.comments ?? !isTriageLikeCaller
      const forceFull = config?.force_full ?? false
      const ticketBodyPreviewChars = config?.ticket_body_preview_chars ?? DEFAULT_TICKET_BODY_PREVIEW_CHARS
      const parsedFilters = parseGetTicketCommentFilters(config)

      const ticket = ticketsRepository.getByNumberWithRelations(project_id, ticket_number)

      if (!ticket) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Ticket #${ticket_number} not found in project ${project_id}` }),
            },
          ],
          isError: true,
        }
      }

      const response: Record<string, unknown> = {
        ticket: buildTicketSummary(ticket, ticketBodyPreviewChars, forceFull),
      }

      const allOverviewComments = includeOverview
        ? commentsRepository.getByTicket(ticket.id).slice().reverse()
        : []
      const agentTypeCache = new Map<string, string | null>()

      const resolveCommentAgentType = (comment: CommentWithAuthor): string | null => {
        if (comment.author.type !== 'agent') return null
        if (agentTypeCache.has(comment.author_id)) {
          return agentTypeCache.get(comment.author_id) ?? null
        }
        const agent = agentsRepository.get(comment.author_id)
        const agentType = typeof agent?.config?.type === 'string' ? agent.config.type : null
        agentTypeCache.set(comment.author_id, agentType)
        return agentType
      }

      if (includeOverview) {
        const participantMap = new Map<string, {
          author_id: string
          actor_type: 'user' | 'agent'
          name: string
          description: string | null
          agent_type: string | null
          comment_count: number
          first_commented_at: string
          last_commented_at: string
        }>()

        for (const comment of allOverviewComments) {
          const existing = participantMap.get(comment.author_id)
          const description = comment.author.description
            ? truncateText(comment.author.description, 240).value
            : null

          if (!existing) {
            participantMap.set(comment.author_id, {
              author_id: comment.author_id,
              actor_type: comment.author.type,
              name: comment.author.name,
              description,
              agent_type: resolveCommentAgentType(comment),
              comment_count: 1,
              first_commented_at: comment.created_at,
              last_commented_at: comment.created_at,
            })
            continue
          }

          existing.comment_count += 1
          if (comment.created_at < existing.first_commented_at) {
            existing.first_commented_at = comment.created_at
          }
          if (comment.created_at > existing.last_commented_at) {
            existing.last_commented_at = comment.created_at
          }
        }

        const participants = [...participantMap.values()].sort((a, b) => {
          if (b.comment_count !== a.comment_count) return b.comment_count - a.comment_count
          return b.last_commented_at.localeCompare(a.last_commented_at)
        })

        response.overview = {
          total_comments: allOverviewComments.length,
          participant_count: participants.length,
          participants,
        }
      }

      const commentsRequested = includeComments || includeImages
      const commentFilterBase: CommentFilters = {
        ticket_id: ticket.id,
        author_ids: parsedFilters.authorIds ? [...parsedFilters.authorIds] : undefined,
        actor_types: parsedFilters.actorTypes ? [...parsedFilters.actorTypes] : undefined,
        agent_types: parsedFilters.agentTypes ? [...parsedFilters.agentTypes] : undefined,
      }
      const pagedComments = commentsRequested
        ? commentsRepository.list({
          ...commentFilterBase,
          sort_order: 'desc',
          limit: parsedFilters.limit,
          offset: parsedFilters.offset,
        })
        : []
      const totalFiltered = commentsRequested
        ? commentsRepository.count(commentFilterBase)
        : 0
      const pagedCommentIds = new Set(pagedComments.map((comment) => comment.id))

      if (includeComments) {
        response.comments = pagedComments.map((comment) => {
          const commentPayload: Record<string, unknown> = {
            id: comment.id,
            ticket_id: comment.ticket_id,
            author_id: comment.author_id,
            author_name: comment.author.name,
            actor_type: comment.author.type,
            agent_type: resolveCommentAgentType(comment),
            parent_id: comment.parent_id,
            is_edited: comment.is_edited,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
          }

          if (parsedFilters.includeBodies) {
            if (forceFull) {
              commentPayload.body = comment.body
              commentPayload.body_truncated = false
            } else {
              const body = truncateText(comment.body, parsedFilters.maxBodyChars)
              commentPayload.body = body.value
              commentPayload.body_truncated = body.truncated
            }
          }

          return commentPayload
        })
      }

      if (includeImages) {
        const ticketAttachments = attachmentsRepository.getByTicket(ticket.id)
        const attachmentsByComment = attachmentsRepository.getByTicketComments(ticket.id)

        response.ticket_attachments = ticketAttachments
          .filter(isImageAttachment)
          .map(toAttachmentMetaWithPath)

        response.comment_attachments = Object.entries(attachmentsByComment)
          .filter(([commentId]) => pagedCommentIds.has(Number(commentId)))
          .map(([commentId, commentAttachments]) => ({
            comment_id: Number(commentId),
            attachments: commentAttachments
              .filter(isImageAttachment)
              .map(toAttachmentMetaWithPath),
          }))
          .filter((entry) => entry.attachments.length > 0)
      }

      response.meta = {
        cap_bytes: MAX_GET_TICKET_RESPONSE_BYTES,
        cap_enforced: !forceFull,
        force_full: forceFull,
        caller_agent_type: callerAgentType ?? null,
        section_flags: {
          overview: includeOverview,
          comments: includeComments,
          images: includeImages,
        },
        defaults_applied: {
          comments: config?.comments === undefined,
          overview: config?.overview === undefined,
          images: config?.images === undefined,
        },
        comments_page: {
          total_filtered: totalFiltered,
          returned: pagedComments.length,
          offset: parsedFilters.offset,
          limit: parsedFilters.limit,
          has_more: parsedFilters.offset + pagedComments.length < totalFiltered,
          next_offset:
            parsedFilters.offset + pagedComments.length < totalFiltered
              ? parsedFilters.offset + pagedComments.length
              : null,
          filters: {
            author_ids: parsedFilters.authorIds ? [...parsedFilters.authorIds] : undefined,
            actor_types: parsedFilters.actorTypes ? [...parsedFilters.actorTypes] : undefined,
            agent_types: parsedFilters.agentTypes ? [...parsedFilters.agentTypes] : undefined,
          },
        },
        truncated: false,
      }

      if (forceFull) {
        const serialized = serializeGetTicketPayloadWithoutCap(response)
        return {
          content: [
            { type: 'text' as const, text: serialized },
          ],
        }
      }

      const prune = pruneGetTicketPayloadToHardCap(response, MAX_GET_TICKET_RESPONSE_BYTES)
      const finalPayload = prune.payload

      const finalMeta = (
        finalPayload.meta
        && typeof finalPayload.meta === 'object'
        && !Array.isArray(finalPayload.meta)
      )
        ? finalPayload.meta as Record<string, unknown>
        : {}

      finalMeta.truncated = prune.truncated
      finalMeta.prune_stats = prune.stats
      finalPayload.meta = finalMeta

      const serialized = serializeGetTicketPayloadWithinCap(finalPayload, MAX_GET_TICKET_RESPONSE_BYTES)

      return {
        content: [
          { type: 'text' as const, text: serialized },
        ],
      }
    }
  )

  // Tool 2: get_ticket_comment
  registerTool(
    'get_ticket_comment',
    {
      description:
        'Get a single ticket comment by ID. Optionally include image attachment metadata with file paths.',
      inputSchema: {
        comment_id: z
          .number()
          .int()
          .positive()
          .describe('The ID of the comment to retrieve'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional caller session ID for caller-aware defaults'),
        config: getTicketCommentConfigSchema
          .describe('Optional sections to include'),
      },
    },
    async ({ comment_id, config }) => {
      const comment = commentsRepository.get(comment_id)

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

      const commentAgentType = comment.author.type === 'agent'
        ? (() => {
          const agent = agentsRepository.get(comment.author_id)
          return typeof agent?.config?.type === 'string' ? agent.config.type : null
        })()
        : null

      const response: Record<string, unknown> = {
        id: comment.id,
        ticket_id: comment.ticket_id,
        author_id: comment.author_id,
        author_name: comment.author.name,
        actor_type: comment.author.type,
        agent_type: commentAgentType,
        parent_id: comment.parent_id,
        is_edited: comment.is_edited,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        body: comment.body,
        body_truncated: false,
      }

      const includeImages = config?.images ?? false
      if (includeImages) {
        response.attachments = attachmentsRepository.getByComment(comment_id)
          .filter(isImageAttachment)
          .map(toAttachmentMetaWithPath)
      }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(response) },
        ],
      }
    }
  )

  // Tool 3: add_comment
  registerTool(
    'add_comment',
    {
      description:
        'Add a comment to a ticket. The comment body supports @profile and #ticket mentions which are automatically parsed. Returns the created comment.',
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe('The project ID'),
        ticket_number: z
          .number()
          .int()
          .positive()
          .describe('The per-project ticket number'),
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
    async ({ project_id, ticket_number, body, parent_id, kombuse_session_id }) => {
      // Verify ticket exists first
      const ticket = ticketsRepository.getByNumber(project_id, ticket_number)
      if (!ticket) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Ticket #${ticket_number} not found in project ${project_id}` }),
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
          resourceId: ticket.id,
          projectId: ticket.project_id,
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot add comments')
        }
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
        }
      }

      const comment = commentsRepository.create({
        ticket_id: ticket.id,
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

  // Tool 4: create_ticket
  registerTool(
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
        loop_protection_enabled: z
          .boolean()
          .optional()
          .describe('Whether agent loop protection is enabled for the ticket (default: true)'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID linking this ticket to the agent session that created it'),
      },
    },
    async ({ project_id, title, body, triggers_enabled, loop_protection_enabled, kombuse_session_id }) => {
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
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
        }
      }

      const ticket = ticketsRepository.create({
        project_id,
        author_id: authorId,
        title,
        body,
        triggers_enabled: triggers_enabled ?? false,
        loop_protection_enabled: loop_protection_enabled ?? true,
      })

      const ticketWithRelations = ticketsRepository._getInternalWithRelations(ticket.id)

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

  // Tool 5: update_comment
  registerTool(
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
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID linking this comment to the agent session that created it'),
      },
    },
    async ({ comment_id, body, kombuse_session_id }) => {
      const existing = commentsRepository.get(comment_id)
      if (!existing) {
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

      const ticket = ticketsRepository._getInternal(existing.ticket_id)

      // Enforce permissions for agent callers
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        const result = checkAgentPermission(agentContext, {
          type: 'resource',
          resource: 'comment',
          action: 'update',
          resourceId: comment_id,
          projectId: ticket?.project_id,
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot update comments')
        }
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
        }
      }

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

  // Tool 6: list_tickets
  registerTool(
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

  // Tool 7: search_tickets
  registerTool(
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

  // Tool 8: list_projects
  registerTool(
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

  // Tool 9: list_labels
  registerTool(
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

  // Tool 10: update_ticket
  registerTool(
    'update_ticket',
    {
      description:
        'Update a ticket. Can change title, body, status, priority, assignee, and add/remove labels — all in a single call. Returns the updated ticket with its current labels.',
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe('The project ID'),
        ticket_number: z
          .number()
          .int()
          .positive()
          .describe('The per-project ticket number'),
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
    async ({ project_id, ticket_number, title, body, status, priority, assignee_id, add_label_ids, remove_label_ids, kombuse_session_id }) => {
      const ticket = ticketsRepository.getByNumber(project_id, ticket_number)
      if (!ticket) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Ticket #${ticket_number} not found in project ${project_id}` }),
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
            resourceId: ticket.id,
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
            resourceId: ticket.id,
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
            resourceId: ticket.id,
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
            resourceId: ticket.id,
            projectId: ticket.project_id,
          })
          if (!result.allowed) {
            return permissionDeniedResponse(result.reason ?? 'Cannot update ticket fields')
          }
        }
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
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
        ticketsRepository.update(ticket.id, updateInput, actorId)
      }

      // Add labels
      if (add_label_ids) {
        for (const labelId of add_label_ids) {
          labelsRepository.addToTicket(ticket.id, labelId, actorId)
        }
      }

      // Remove labels
      if (remove_label_ids) {
        for (const labelId of remove_label_ids) {
          labelsRepository.removeFromTicket(ticket.id, labelId, actorId)
        }
      }

      // Return updated state
      const updatedTicket = ticketsRepository._getInternalWithRelations(ticket.id)!

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ticket: updatedTicket,
                labels: updatedTicket.labels,
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}
