import type { AgentEvent, BackendType, Session, SessionEvent, SessionMetadata, SessionStatus, KombuseSessionId } from '@kombuse/types'
import { sessionsRepository, sessionEventsRepository } from '@kombuse/persistence'

/**
 * Options for session persistence behavior
 */
export interface SessionPersistenceOptions {
  /** Maximum payload size in bytes before truncation (default: 102400 = 100KB) */
  maxPayloadSize?: number
}

/**
 * Service interface for session persistence operations
 */
export interface ISessionPersistenceService {
  ensureSession(kombuseSessionId: KombuseSessionId, backendType?: BackendType, ticketId?: number, agentId?: string): string
  markSessionRunning(sessionId: string): void
  persistEvent(sessionId: string, event: AgentEvent): void
  completeSession(sessionId: string, backendSessionId?: string): void
  failSession(sessionId: string, backendSessionId?: string): void
  abortSession(sessionId: string, backendSessionId?: string): void
  getSession(sessionId: string): Session | null
  getSessionByKombuseId(kombuseSessionId: string): Session | null
  getSessionEvents(sessionId: string, sinceSeq?: number): SessionEvent[]
  getMetadata(sessionId: string): SessionMetadata
  setMetadata(sessionId: string, patch: Partial<SessionMetadata>): void
  updateStatus(sessionId: string, status: SessionStatus): void
}

/**
 * Service for persisting agent session events to the database.
 *
 * This service handles:
 * - Creating/retrieving sessions by kombuseSessionId
 * - Persisting all events as they stream (with truncation for large payloads)
 * - Tracking session status (running, completed, failed)
 */
export class SessionPersistenceService implements ISessionPersistenceService {
  private options: Required<SessionPersistenceOptions>
  private seqCounters: Map<string, number> = new Map()
  private sessionsWithBackendId: Set<string> = new Set()

  constructor(options: SessionPersistenceOptions = {}) {
    this.options = {
      maxPayloadSize: options.maxPayloadSize ?? 102400,
    }
  }

  /**
   * Create or get a session for the given kombuseSessionId.
   * Returns the internal session ID (not the kombuse session ID).
   */
  ensureSession(kombuseSessionId: KombuseSessionId, backendType?: BackendType, ticketId?: number, agentId?: string): string {
    let session = sessionsRepository.getByKombuseSessionId(kombuseSessionId)

    if (!session) {
      session = sessionsRepository.create({
        id: crypto.randomUUID(),
        kombuse_session_id: kombuseSessionId,
        backend_type: backendType,
        ticket_id: ticketId,
        agent_id: agentId,
      })
    } else {
      const patch: Parameters<typeof sessionsRepository.update>[1] = {}

      if (agentId && !session.agent_id) {
        patch.agent_id = agentId
      }

      // Persist backend selection changes for this session and clear stale
      // backend-native session ID so resume starts from a clean provider context.
      if (backendType && session.backend_type !== backendType) {
        patch.backend_type = backendType
        patch.backend_session_id = null
      }

      if (Object.keys(patch).length > 0) {
        session = sessionsRepository.update(session.id, patch) ?? session
      }
    }

    // Initialize sequence counter from database if not cached
    if (!this.seqCounters.has(session.id)) {
      const nextSeq = sessionEventsRepository.getNextSeq(session.id)
      this.seqCounters.set(session.id, nextSeq)
    }
    if (typeof session.backend_session_id === 'string' && session.backend_session_id.trim().length > 0) {
      this.sessionsWithBackendId.add(session.id)
    }

    return session.id
  }

  /**
   * Persist a single agent event to the database.
   */
  persistEvent(sessionId: string, event: AgentEvent): void {
    const seq = this.getNextSeq(sessionId)
    const payload = this.serializeEvent(event)

    sessionEventsRepository.create({
      session_id: sessionId,
      seq,
      event_type: event.type,
      payload,
    })

    // Capture backend session IDs as soon as they appear in stream events.
    const update: { last_event_seq: number; backend_session_id?: string } = {
      last_event_seq: seq,
    }
    if (!this.sessionsWithBackendId.has(sessionId)) {
      const inferredBackendSessionId = this.extractBackendSessionId(event)
      if (inferredBackendSessionId) {
        update.backend_session_id = inferredBackendSessionId
        this.sessionsWithBackendId.add(sessionId)
      }
    }

    sessionsRepository.update(sessionId, update)
  }

  /**
   * Mark session as actively running.
   */
  markSessionRunning(sessionId: string): void {
    sessionsRepository.update(sessionId, {
      status: 'running',
    })
  }

  /**
   * Mark session as completed with optional backend session ID.
   */
  completeSession(sessionId: string, backendSessionId?: string): void {
    const now = new Date().toISOString()
    sessionsRepository.update(sessionId, {
      status: 'completed',
      backend_session_id: backendSessionId,
      completed_at: now,
      failed_at: null,
      aborted_at: null,
    })
    if (backendSessionId) {
      this.sessionsWithBackendId.add(sessionId)
    }
  }

  /**
   * Mark session as failed with optional backend session ID.
   */
  failSession(sessionId: string, backendSessionId?: string): void {
    const now = new Date().toISOString()
    sessionsRepository.update(sessionId, {
      status: 'failed',
      backend_session_id: backendSessionId,
      completed_at: null,
      failed_at: now,
      aborted_at: null,
    })
    if (backendSessionId) {
      this.sessionsWithBackendId.add(sessionId)
    }
  }

  /**
   * Mark session as aborted with optional backend session ID.
   */
  abortSession(sessionId: string, backendSessionId?: string): void {
    const now = new Date().toISOString()
    sessionsRepository.update(sessionId, {
      status: 'aborted',
      backend_session_id: backendSessionId,
      completed_at: null,
      failed_at: now,
      aborted_at: now,
    })
    if (backendSessionId) {
      this.sessionsWithBackendId.add(sessionId)
    }
  }

  /**
   * Get session by internal ID.
   */
  getSession(sessionId: string): Session | null {
    return sessionsRepository.get(sessionId)
  }

  /**
   * Get session by kombuse session ID.
   * Accepts any string to support legacy IDs and API lookups.
   */
  getSessionByKombuseId(kombuseSessionId: string): Session | null {
    return sessionsRepository.getByKombuseSessionId(kombuseSessionId)
  }

  /**
   * Get all events for a session, optionally filtering to events after a sequence number.
   */
  getSessionEvents(sessionId: string, sinceSeq?: number): SessionEvent[] {
    return sessionEventsRepository.getBySession(sessionId, sinceSeq)
  }

  /**
   * Get persisted workflow metadata for a session.
   */
  getMetadata(sessionId: string): SessionMetadata {
    const session = sessionsRepository.get(sessionId)
    return session?.metadata ?? {}
  }

  /**
   * Merge a partial metadata patch into the session's metadata.
   */
  setMetadata(sessionId: string, patch: Partial<SessionMetadata>): void {
    const current = this.getMetadata(sessionId)
    const merged = { ...current, ...patch }
    sessionsRepository.update(sessionId, { metadata: merged })
  }

  /**
   * Update session status directly.
   */
  updateStatus(sessionId: string, status: SessionStatus): void {
    sessionsRepository.update(sessionId, { status })
  }

  /**
   * Get and increment the sequence counter for a session.
   */
  private getNextSeq(sessionId: string): number {
    const current = this.seqCounters.get(sessionId)
      ?? sessionEventsRepository.getNextSeq(sessionId)
    this.seqCounters.set(sessionId, current + 1)
    return current
  }

  /**
   * Serialize an agent event for storage, handling non-JSON-safe values.
   */
  private serializeEvent(event: AgentEvent): Record<string, unknown> {
    const serialized = { ...event } as Record<string, unknown>

    // Convert Error objects to serializable format
    if ('error' in serialized && serialized.error instanceof Error) {
      serialized.error = {
        name: serialized.error.name,
        message: serialized.error.message,
        stack: serialized.error.stack,
      }
    }

    // Check payload size and truncate if necessary
    const json = JSON.stringify(serialized)
    if (json.length > this.options.maxPayloadSize) {
      serialized._truncated = true
      serialized._originalSize = json.length

      // Truncate content fields if present
      if ('content' in serialized && typeof serialized.content === 'string') {
        const maxContentLength = Math.floor(this.options.maxPayloadSize * 0.8)
        serialized.content =
          serialized.content.substring(0, maxContentLength) + '...[truncated]'
      }
    }

    return serialized
  }

  private extractBackendSessionId(event: AgentEvent): string | undefined {
    if (event.type === 'complete' && typeof event.sessionId === 'string') {
      const trimmed = event.sessionId.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    if (event.type !== 'raw' || typeof event.data !== 'object' || event.data === null) {
      return undefined
    }

    const rawData = event.data as Record<string, unknown>
    const nestedSession =
      typeof rawData.session === 'object' && rawData.session !== null
        ? rawData.session as Record<string, unknown>
        : undefined

    const candidates = [
      rawData.session_id,
      rawData.sessionId,
      nestedSession?.id,
      nestedSession?.session_id,
    ]

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue
      }
      const trimmed = candidate.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }

    return undefined
  }
}

// Singleton instance for convenience
export const sessionPersistenceService = new SessionPersistenceService()

/**
 * Maximum character budget for conversation summary injected into system prompt.
 */
const MAX_SUMMARY_CHARS = 8000

/**
 * Build a human-readable conversation summary from session events.
 *
 * Filters to message events, extracts role and content, and formats as a
 * transcript. Truncates to the last N turns that fit within MAX_SUMMARY_CHARS.
 * Returns empty string if no message events exist.
 */
export function buildConversationSummary(events: SessionEvent[]): string {
  const messageEvents = events.filter((e) => e.event_type === 'message')

  if (messageEvents.length === 0) return ''

  const lines: string[] = []
  let totalChars = 0

  for (let i = messageEvents.length - 1; i >= 0; i--) {
    const event = messageEvents[i]!
    const role = event.payload.role as string | undefined
    const content = event.payload.content as string | undefined

    if (!role || !content) continue

    const label = role === 'user' ? '**User**' : role === 'assistant' ? '**Assistant**' : `**${role}**`
    const line = `${label}: ${content}`

    if (totalChars + line.length > MAX_SUMMARY_CHARS && lines.length > 0) {
      break
    }

    lines.unshift(line)
    totalChars += line.length
  }

  return lines.join('\n\n')
}
