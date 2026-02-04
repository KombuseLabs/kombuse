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
  limit?: number
  offset?: number
}
