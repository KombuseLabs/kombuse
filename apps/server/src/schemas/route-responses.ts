import { z } from 'zod'
import { agentExportResultSchema } from './agents'
import { pluginExportResultSchema, pluginInstallResultSchema } from './plugins'
import {
  agentInvocationSchema,
  agentProcessEventResponseSchema,
  agentSchema,
  backendStatusSchema,
  backendTypeSchema,
  agentTriggerSchema,
  attachmentSchema,
  claudeCodeSessionResponseSchema,
  commentWithAuthorSchema,
  databaseQueryResponseSchema,
  databaseTablesResponseSchema,
  eventSchema,
  eventSubscriptionSchema,
  eventWithActorSchema,
  availablePluginSchema,
  labelSchema,
  milestoneSchema,
  milestoneWithStatsSchema,
  permissionLogEntrySchema,
  pluginSchema,
  profileSchema,
  profileSettingSchema,
  projectSchema,
  publicSessionSchema,
  sessionEventSchema,
  ticketSchema,
  ticketStatusCountsSchema,
  ticketTimelineResponseSchema,
  ticketViewSchema,
  ticketWithRelationsSchema,
} from '@kombuse/types/schemas'

const successResponseSchemaByRoute = new Map<string, z.ZodTypeAny>()

const streamResponseRouteKeys = new Set<string>([
  'GET /api/attachments/:id/download',
])

const noBodyResponseRouteKeys = new Set<string>([
  'DELETE /api/agents/:id',
  'DELETE /api/triggers/:id',
  'DELETE /api/subscriptions/:id',
  'DELETE /api/labels/:id',
  'DELETE /api/tickets/:ticketId/labels/:labelId',
  'DELETE /api/milestones/:id',
  'DELETE /api/comments/:id',
  'DELETE /api/attachments/:id',
  'DELETE /api/profiles/:profileId/settings/:key',
  'DELETE /api/profiles/:id',
  'DELETE /api/projects/:id',
  'DELETE /api/sessions/:id',
  'DELETE /api/tickets/:id',
  'DELETE /api/plugins/:id',
])

const successFlagSchema = z.object({
  success: z.literal(true),
})

const mentionBaseSchema = z.object({
  id: z.number().int().positive(),
  comment_id: z.number().int().positive(),
  mention_text: z.string().min(1),
  created_at: z.string().min(1),
})

const mentionSchema = z.discriminatedUnion('mention_type', [
  mentionBaseSchema.extend({
    mention_type: z.literal('profile'),
    mentioned_profile_id: z.string().min(1),
    mentioned_ticket_id: z.null(),
  }),
  mentionBaseSchema.extend({
    mention_type: z.literal('ticket'),
    mentioned_profile_id: z.null(),
    mentioned_ticket_id: z.number().int().positive(),
  }),
])

const unprocessedEventsResponseSchema = z.object({
  subscription: eventSubscriptionSchema,
  events: z.array(eventSchema),
})

const claudeCodeProjectWithStatusSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  lastAccessed: z.string().min(1),
  totalSessions: z.number().int().nonnegative(),
  totalMessages: z.number().int().nonnegative(),
  gitBranch: z.string().nullable(),
  isImported: z.boolean(),
})

const claudeCodeSessionEntrySchema = z.object({
  sessionId: z.string().min(1),
  messageCount: z.number().int().nonnegative(),
  created: z.string().min(1),
  modified: z.string().min(1),
  gitBranch: z.string(),
  projectPath: z.string().min(1),
})

const claudeCodeSessionsResponseSchema = z.object({
  sessions: z.array(claudeCodeSessionEntrySchema),
})

const codexMcpStatusSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  config_path: z.string().min(1),
  command: z.string().nullable(),
  args: z.array(z.string()),
  bridge_path: z.string().nullable(),
})

const codexMcpUpdateResponseSchema = codexMcpStatusSchema.extend({
  stopped_sessions: z.number().int().nonnegative(),
})

const modelOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
})

const modelCatalogResponseSchema = z.object({
  backend_type: backendTypeSchema,
  supports_model_selection: z.boolean(),
  models: z.array(modelOptionSchema),
  default_model_id: z.string().min(1).optional(),
})

const updateInfoSchema = z.object({
  version: z.string().min(1),
  downloadUrl: z.string().min(1),
  checksumUrl: z.string().min(1),
  releaseUrl: z.string().min(1),
  releaseNotes: z.string().nullable(),
  publishedAt: z.string().min(1),
})

const updateStatusSchema = z.object({
  state: z.enum([
    'idle',
    'checking',
    'available',
    'downloading',
    'verifying',
    'ready',
    'error',
  ]),
  currentVersion: z.string().min(1),
  updateInfo: updateInfoSchema.nullable(),
  downloadProgress: z.number().min(0).max(100),
  error: z.string().nullable(),
})

const updateCheckResultSchema = z.object({
  hasUpdate: z.boolean(),
  updateInfo: updateInfoSchema.nullable(),
  currentVersion: z.string().min(1),
})

const sessionEventsResponseSchema = z.object({
  session_id: z.string().min(1),
  events: z.array(sessionEventSchema),
  total: z.number().int().nonnegative(),
})

const sessionDiagnosticsSchema = z.object({
  generated_at: z.string().min(1),
  counts_by_status: z.record(z.string(), z.number().int().nonnegative()),
  aborted_by_reason: z.array(
    z.object({
      reason: z.string().min(1),
      count: z.number().int().nonnegative(),
    })
  ),
  terminal_timestamp_gaps: z.object({
    completed_missing_timestamp: z.number().int().nonnegative(),
    failed_missing_timestamp: z.number().int().nonnegative(),
    aborted_missing_timestamp: z.number().int().nonnegative(),
  }),
  recent_aborted_without_backend_session_id: z.array(
    z.object({
      id: z.string().min(1),
      kombuse_session_id: z.string().nullable(),
      ticket_id: z.number().int().positive().nullable(),
      backend_type: z.string().nullable(),
      backend_session_id: z.string().nullable(),
      status: z.string().min(1),
      updated_at: z.string().min(1),
      completed_at: z.string().nullable(),
      failed_at: z.string().nullable(),
      aborted_at: z.string().nullable(),
      terminal_reason: z.string().nullable(),
      terminal_source: z.string().nullable(),
    })
  ),
})

const pendingPermissionSchema = z.object({
  permissionKey: z.string().min(1),
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  description: z.string().min(1),
  ticketId: z.number().int().positive().optional(),
})

const syncTicketAgentStatusSchema = z.object({
  ticketId: z.number().int().positive(),
  status: z.enum(['idle', 'running', 'pending', 'error']),
  sessionCount: z.number().int().nonnegative(),
})

const syncActiveSessionSchema = z.object({
  kombuseSessionId: z.string().min(1),
  agentName: z.string().min(1),
  ticketId: z.number().int().positive().optional(),
  ticketTitle: z.string().optional(),
  effectiveBackend: backendTypeSchema.optional(),
  appliedModel: z.string().optional(),
  startedAt: z.string().min(1),
})

const syncStateSchema = z.object({
  pendingPermissions: z.array(pendingPermissionSchema),
  ticketAgentStatuses: z.array(syncTicketAgentStatusSchema),
  activeSessions: z.array(syncActiveSessionSchema),
})

function registerSuccessSchema(
  method: string,
  path: string,
  schema: z.ZodTypeAny
): void {
  successResponseSchemaByRoute.set(toRouteKey(method, path), schema)
}

// Agent routes
registerSuccessSchema('GET', '/api/agents', z.array(agentSchema))
registerSuccessSchema('GET', '/api/agents/:id', agentSchema)
registerSuccessSchema('POST', '/api/agents', agentSchema)
registerSuccessSchema('PATCH', '/api/agents/:id', agentSchema)
registerSuccessSchema('GET', '/api/agents/:agentId/triggers', z.array(agentTriggerSchema))
registerSuccessSchema('GET', '/api/triggers/:id', agentTriggerSchema)
registerSuccessSchema('POST', '/api/agents/:agentId/triggers', agentTriggerSchema)
registerSuccessSchema('PATCH', '/api/triggers/:id', agentTriggerSchema)
registerSuccessSchema('GET', '/api/invocations', z.array(agentInvocationSchema))
registerSuccessSchema('GET', '/api/invocations/:id', agentInvocationSchema)
registerSuccessSchema('GET', '/api/agents/:agentId/invocations', z.array(agentInvocationSchema))
registerSuccessSchema('POST', '/api/agents/process-event', agentProcessEventResponseSchema)
registerSuccessSchema('POST', '/api/agents/export', agentExportResultSchema)

// Plugin routes
registerSuccessSchema('GET', '/api/plugins', z.array(pluginSchema))
registerSuccessSchema('GET', '/api/plugins/available', z.array(availablePluginSchema))
registerSuccessSchema('GET', '/api/plugins/:id', pluginSchema)
registerSuccessSchema('POST', '/api/plugins/install', pluginInstallResultSchema)
registerSuccessSchema('PATCH', '/api/plugins/:id', pluginSchema)
registerSuccessSchema('POST', '/api/plugins/export', pluginExportResultSchema)

// Backend status routes
registerSuccessSchema('GET', '/api/backend-status', z.array(backendStatusSchema))
registerSuccessSchema('POST', '/api/backend-status/refresh', z.array(backendStatusSchema))

// Attachment routes
registerSuccessSchema('POST', '/api/tickets/:ticketId/attachments', attachmentSchema)
registerSuccessSchema('POST', '/api/comments/:commentId/attachments', attachmentSchema)
registerSuccessSchema('GET', '/api/attachments/:id', attachmentSchema)
registerSuccessSchema('GET', '/api/tickets/:ticketId/attachments', z.array(attachmentSchema))
registerSuccessSchema('GET', '/api/comments/:commentId/attachments', z.array(attachmentSchema))

// Claude Code routes
registerSuccessSchema(
  'GET',
  '/api/claude-code/projects',
  z.array(claudeCodeProjectWithStatusSchema)
)
registerSuccessSchema('POST', '/api/claude-code/projects/import', z.array(projectSchema))
registerSuccessSchema('GET', '/api/claude-code/sessions', claudeCodeSessionsResponseSchema)
registerSuccessSchema('GET', '/api/claude-code/sessions/:sessionId', claudeCodeSessionResponseSchema)

// Codex MCP routes
registerSuccessSchema('GET', '/api/codex/mcp', codexMcpStatusSchema)
registerSuccessSchema('PUT', '/api/codex/mcp', codexMcpUpdateResponseSchema)

// Claude Code MCP routes
registerSuccessSchema('GET', '/api/claude-code/mcp', codexMcpStatusSchema)
registerSuccessSchema('PUT', '/api/claude-code/mcp', codexMcpUpdateResponseSchema)

// Model routes
registerSuccessSchema('GET', '/api/models', modelCatalogResponseSchema)

// Comment routes
registerSuccessSchema('GET', '/api/tickets/:ticketId/comments', z.array(commentWithAuthorSchema))
registerSuccessSchema('GET', '/api/comments/:id', commentWithAuthorSchema)
registerSuccessSchema('POST', '/api/tickets/:ticketId/comments', commentWithAuthorSchema)
registerSuccessSchema('PATCH', '/api/comments/:id', commentWithAuthorSchema)
registerSuccessSchema('GET', '/api/comments/:id/mentions', z.array(mentionSchema))

// Database routes
registerSuccessSchema('GET', '/api/database/tables', databaseTablesResponseSchema)
registerSuccessSchema('POST', '/api/database/query', databaseQueryResponseSchema)

// Event routes
registerSuccessSchema('GET', '/api/events', z.array(eventWithActorSchema))
registerSuccessSchema('GET', '/api/tickets/:ticketId/events', z.array(eventWithActorSchema))
registerSuccessSchema('POST', '/api/events', eventWithActorSchema)
registerSuccessSchema('GET', '/api/subscriptions', z.array(eventSubscriptionSchema))
registerSuccessSchema('POST', '/api/subscriptions', eventSubscriptionSchema)
registerSuccessSchema('GET', '/api/subscriptions/:id/events', unprocessedEventsResponseSchema)
registerSuccessSchema('POST', '/api/subscriptions/:id/acknowledge', successFlagSchema)

// Label routes
registerSuccessSchema('GET', '/api/projects/:projectId/labels', z.array(labelSchema))
registerSuccessSchema('GET', '/api/labels/:id', labelSchema)
registerSuccessSchema('POST', '/api/projects/:projectId/labels', labelSchema)
registerSuccessSchema('PATCH', '/api/labels/:id', labelSchema)
registerSuccessSchema('POST', '/api/tickets/:ticketId/labels/:labelId', successFlagSchema)
registerSuccessSchema('GET', '/api/tickets/:ticketId/labels', z.array(labelSchema))
registerSuccessSchema('GET', '/api/labels/:labelId/triggers', z.array(agentTriggerSchema))

// Milestone routes
registerSuccessSchema('GET', '/api/projects/:projectId/milestones', z.array(milestoneWithStatsSchema))
registerSuccessSchema('GET', '/api/milestones/:id', milestoneWithStatsSchema)
registerSuccessSchema('POST', '/api/projects/:projectId/milestones', milestoneSchema)
registerSuccessSchema('PATCH', '/api/milestones/:id', milestoneSchema)

// Permission routes
registerSuccessSchema('GET', '/api/projects/:projectId/permissions', z.array(permissionLogEntrySchema))

// Profile settings routes
registerSuccessSchema('GET', '/api/profiles/:profileId/settings', z.array(profileSettingSchema))
registerSuccessSchema('GET', '/api/profiles/:profileId/settings/:key', profileSettingSchema.nullable())
registerSuccessSchema('PUT', '/api/profile-settings', profileSettingSchema)

// Profile routes
registerSuccessSchema('GET', '/api/profiles', z.array(profileSchema))
registerSuccessSchema('GET', '/api/profiles/:id', profileSchema)
registerSuccessSchema('POST', '/api/profiles', profileSchema)
registerSuccessSchema('PATCH', '/api/profiles/:id', profileSchema)

// Project routes
registerSuccessSchema('GET', '/api/projects', z.array(projectSchema))
registerSuccessSchema('GET', '/api/projects/:id', projectSchema)
registerSuccessSchema('POST', '/api/projects', projectSchema)
registerSuccessSchema('PATCH', '/api/projects/:id', projectSchema)

// Analytics routes
registerSuccessSchema(
  'GET',
  '/api/analytics/sessions-per-day',
  z.array(
    z.object({
      date: z.string().min(1),
      count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/duration-percentiles',
  z.array(
    z.object({
      agent_id: z.string().nullable(),
      agent_name: z.string().nullable(),
      p50: z.number(),
      p90: z.number(),
      p99: z.number(),
      avg: z.number(),
      count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/pipeline-stage-duration',
  z.array(
    z.object({
      agent_id: z.string(),
      agent_name: z.string(),
      avg_duration: z.number(),
      p50: z.number(),
      p90: z.number(),
      count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/most-frequent-reads',
  z.array(
    z.object({
      file_path: z.string(),
      read_count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/tool-calls-per-session',
  z.array(
    z.object({
      session_id: z.string(),
      agent_id: z.string().nullable(),
      agent_name: z.string(),
      call_count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/slowest-tools',
  z.array(
    z.object({
      tool_name: z.string(),
      count: z.number().int().nonnegative(),
      avg: z.number(),
      p50: z.number(),
      p90: z.number(),
      p99: z.number(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/tool-call-volume',
  z.array(
    z.object({
      tool_name: z.string(),
      call_count: z.number().int().nonnegative(),
      session_count: z.number().int().nonnegative(),
    })
  )
)
registerSuccessSchema(
  'GET',
  '/api/analytics/ticket-burndown',
  z.array(
    z.object({
      date: z.string().min(1),
      total: z.number().int().nonnegative(),
      open: z.number().int().nonnegative(),
      closed: z.number().int().nonnegative(),
      ideal: z.number().nullable(),
    })
  )
)

// Session routes
registerSuccessSchema('GET', '/api/sessions', z.array(publicSessionSchema))
registerSuccessSchema('GET', '/api/sessions/diagnostics', sessionDiagnosticsSchema)
registerSuccessSchema('POST', '/api/sessions', publicSessionSchema)
registerSuccessSchema('GET', '/api/sessions/:id', publicSessionSchema)
registerSuccessSchema('GET', '/api/sessions/:id/events', sessionEventsResponseSchema)

// Sync routes
registerSuccessSchema('GET', '/api/sync/state', syncStateSchema)

// Ticket routes
registerSuccessSchema('GET', '/api/tickets', z.array(ticketWithRelationsSchema))
registerSuccessSchema('GET', '/api/tickets/counts', ticketStatusCountsSchema)
registerSuccessSchema('GET', '/api/tickets/:id', ticketWithRelationsSchema)
registerSuccessSchema('POST', '/api/tickets', ticketSchema)
registerSuccessSchema('PATCH', '/api/tickets/:id', ticketSchema)
registerSuccessSchema('POST', '/api/tickets/:id/claim', ticketSchema)
registerSuccessSchema('POST', '/api/tickets/:id/unclaim', ticketSchema)
registerSuccessSchema('POST', '/api/tickets/:id/claim/extend', ticketSchema)
registerSuccessSchema('POST', '/api/tickets/:id/view', ticketViewSchema)
registerSuccessSchema('GET', '/api/tickets/:id/timeline', ticketTimelineResponseSchema)

// Update routes
registerSuccessSchema('GET', '/api/updates/status', updateStatusSchema)
registerSuccessSchema('POST', '/api/updates/check', updateCheckResultSchema)
registerSuccessSchema('POST', '/api/updates/install', successFlagSchema)

// Shell update routes
registerSuccessSchema('GET', '/api/shell-updates/status', updateStatusSchema)
registerSuccessSchema('POST', '/api/shell-updates/check', updateCheckResultSchema)
registerSuccessSchema('POST', '/api/shell-updates/install', successFlagSchema)

// Desktop window routes
const desktopWindowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
})

const desktopScreenshotSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string().min(1),
})

registerSuccessSchema('GET', '/api/desktop/windows', z.array(desktopWindowSchema))
registerSuccessSchema('POST', '/api/desktop/windows', desktopWindowSchema)
registerSuccessSchema('POST', '/api/desktop/windows/:id/navigate', desktopWindowSchema.pick({ id: true, url: true }))
registerSuccessSchema('POST', '/api/desktop/windows/:id/screenshot', desktopScreenshotSchema)

export function toRouteKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

export function getSuccessResponseSchema(routeKey: string): z.ZodTypeAny | undefined {
  return successResponseSchemaByRoute.get(routeKey)
}

export function isStreamResponseRoute(routeKey: string): boolean {
  return streamResponseRouteKeys.has(routeKey)
}

export function isNoBodyResponseRoute(routeKey: string): boolean {
  return noBodyResponseRouteKeys.has(routeKey)
}
