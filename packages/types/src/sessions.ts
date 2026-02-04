/**
 * Session entity - stores agent conversation history
 */
export interface Session {
  id: string
  kombuse_session_id: string | null
  backend_type: string | null
  backend_session_id: string | null
  status: 'running' | 'completed' | 'failed' | 'aborted'
  started_at: string
  completed_at: string | null
  failed_at: string | null
  last_event_seq: number
  created_at: string
  updated_at: string
}

/**
 * Input for creating a session
 */
export interface CreateSessionInput {
  id?: string
  kombuse_session_id?: string
  backend_type?: string
  backend_session_id?: string
}

/**
 * Filters for listing sessions
 */
export interface SessionFilters {
  status?: 'running' | 'completed' | 'failed' | 'aborted'
  limit?: number
  offset?: number
}

/**
 * Input for updating a session
 */
export interface UpdateSessionInput {
  backend_session_id?: string
  status?: 'running' | 'completed' | 'failed' | 'aborted'
  completed_at?: string
  failed_at?: string
  last_event_seq?: number
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
