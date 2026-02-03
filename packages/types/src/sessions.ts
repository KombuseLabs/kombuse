/**
 * Session entity - stores agent conversation history
 */
export interface Session {
  id: string
  created_at: string
  updated_at: string
}

/**
 * Input for creating a session
 */
export interface CreateSessionInput {
  id?: string
}

/**
 * Filters for listing sessions
 */
export interface SessionFilters {
  limit?: number
  offset?: number
}
