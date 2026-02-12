import type { KombuseSessionId } from './session-id'

/**
 * All possible session lifecycle states.
 */
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'stopped'

/**
 * Persisted workflow state that survives process restarts.
 * Stored as JSON in sessions.metadata column.
 */
export interface SessionMetadata {
  planCommentId?: number
  didCallAddComment?: boolean
  lastAssistantMessage?: string
  exitPlanModeToolUseId?: string
  [key: string]: unknown
}

/**
 * Session entity - stores agent conversation history
 */
export interface Session {
  id: string
  kombuse_session_id: KombuseSessionId | null
  backend_type: string | null
  backend_session_id: string | null
  ticket_id: number | null
  agent_id: string | null
  status: SessionStatus
  metadata: SessionMetadata
  started_at: string
  completed_at: string | null
  failed_at: string | null
  last_event_seq: number
  created_at: string
  updated_at: string
  agent_name?: string | null
  prompt_preview?: string | null
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
  backend_type?: string
  backend_session_id?: string
  ticket_id?: number
  agent_id?: string
  metadata?: SessionMetadata
}

/**
 * Filters for listing sessions
 */
export interface SessionFilters {
  ticket_id?: number
  status?: SessionStatus
  sort_by?: 'created_at' | 'updated_at'
  limit?: number
  offset?: number
}

/**
 * Input for updating a session
 */
export interface UpdateSessionInput {
  backend_session_id?: string
  status?: SessionStatus
  metadata?: SessionMetadata
  completed_at?: string
  failed_at?: string
  last_event_seq?: number
  agent_id?: string
}

/**
 * Session event entity - stores individual events within a session
 */
export interface SessionEvent {
  id: number
  session_id: string
  seq: number
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

/**
 * Input for creating a session event
 */
export interface CreateSessionEventInput {
  session_id: string
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
 * A permission log entry combining a permission request with its response.
 */
export interface PermissionLogEntry {
  id: number
  session_id: string
  kombuse_session_id: string | null
  ticket_id: number | null
  ticket_title: string | null
  requested_at: string
  request_id: string
  tool_name: string
  description: string | null
  input: Record<string, unknown>
  auto_approved: boolean
  behavior: 'allow' | 'deny' | null
  deny_message: string | null
  resolved_at: string | null
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
