import type { z } from 'zod'
import type {
  sessionStatusSchema,
  sessionSchema,
  sessionEventSchema,
  permissionLogEntrySchema,
} from './schemas/entities'
import type { KombuseSessionId } from './session-id.types'
import type { BackendType } from './agent.types'

// Derived from Zod schemas (single source of truth)
export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type SessionEvent = z.infer<typeof sessionEventSchema>
export type PermissionLogEntry = z.infer<typeof permissionLogEntrySchema>

/**
 * Persisted workflow state that survives process restarts.
 * Stored as JSON in sessions.metadata column.
 * Kept hand-written because the Zod schema is z.record() (too loose).
 */
export interface SessionMetadata {
  planCommentId?: number
  didCallAddComment?: boolean
  lastAssistantMessage?: string
  exitPlanModeToolUseId?: string
  /** Effective backend resolved for this session at execution time. */
  effective_backend?: BackendType | null
  /** Sticky model preference snapshot resolved for this session. */
  model_preference?: string | null
  /** Model effectively applied by backend (null when backend cannot enforce). */
  applied_model?: string | null
  /** CLI/server version reported by the backend at session start */
  cli_version?: string | null
  /** Permission mode the session ran with */
  permission_mode?: string | null
  /** Whether extended thinking was enabled */
  thinking_enabled?: boolean | null
  /** Thinking token budget if thinking was enabled */
  thinking_budget?: number | null
  /** Agent preset type (e.g. 'kombuse', 'coder', 'generic') */
  agent_preset_type?: string | null
  terminal_reason?: string
  terminal_source?: string
  terminal_at?: string
  terminal_error?: string
  [key: string]: unknown
}

/**
 * Session entity - stores agent conversation history.
 * Derived from sessionSchema with overrides for branded KombuseSessionId and rich SessionMetadata.
 */
type SessionBase = z.infer<typeof sessionSchema>
export type Session = Omit<SessionBase, 'kombuse_session_id' | 'metadata'> & {
  kombuse_session_id: KombuseSessionId | null
  metadata: SessionMetadata
}

/**
 * Session as exposed by the public API — omits internal database ID.
 * Frontend code should use this type exclusively.
 */
export type PublicSession = Omit<Session, 'id'>

/**
 * Input for creating a session
 */
export interface CreateSessionInput {
  id?: string
  kombuse_session_id?: KombuseSessionId
  backend_type?: BackendType
  backend_session_id?: string
  ticket_id?: number
  project_id?: string
  agent_id?: string
  metadata?: SessionMetadata
}

/**
 * Filters for listing sessions
 */
export interface SessionFilters {
  ticket_id?: number
  project_id?: string
  agent_id?: string
  status?: SessionStatus
  terminal_reason?: string
  has_backend_session_id?: boolean
  sort_by?: 'created_at' | 'updated_at'
  limit?: number
  offset?: number
}

/**
 * Input for updating a session
 */
export interface UpdateSessionInput {
  backend_type?: BackendType
  backend_session_id?: string | null
  project_id?: string | null
  status?: SessionStatus
  metadata?: SessionMetadata
  completed_at?: string | null
  failed_at?: string | null
  aborted_at?: string | null
  last_event_seq?: number
  agent_id?: string
}

/**
 * Input for creating a session event
 */
export interface CreateSessionEventInput {
  session_id: string
  kombuse_session_id?: string
  seq: number
  event_type: string
  payload: Record<string, unknown>
}

/**
 * Filters for listing session events
 */
export interface SessionEventFilters {
  session_id?: string
  event_type?: string
  since_seq?: number
  limit?: number
  offset?: number
}

/**
 * Filters for listing permission log entries.
 */
export interface PermissionLogFilters {
  project_id?: string
  tool_name?: string
  behavior?: 'allow' | 'deny' | 'auto_approved'
  limit?: number
  offset?: number
}
