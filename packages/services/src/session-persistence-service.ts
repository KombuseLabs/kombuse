import type { AgentEvent, Session, SessionEvent, KombuseSessionId } from '@kombuse/types'
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
  ensureSession(kombuseSessionId: KombuseSessionId, backendType?: string, ticketId?: number): string
  markSessionRunning(sessionId: string): void
  persistEvent(sessionId: string, event: AgentEvent): void
  completeSession(sessionId: string, backendSessionId?: string): void
  failSession(sessionId: string): void
  getSession(sessionId: string): Session | null
  getSessionByKombuseId(kombuseSessionId: string): Session | null
  getSessionEvents(sessionId: string, sinceSeq?: number): SessionEvent[]
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

  constructor(options: SessionPersistenceOptions = {}) {
    this.options = {
      maxPayloadSize: options.maxPayloadSize ?? 102400,
    }
  }

  /**
   * Create or get a session for the given kombuseSessionId.
   * Returns the internal session ID (not the kombuse session ID).
   */
  ensureSession(kombuseSessionId: KombuseSessionId, backendType?: string, ticketId?: number): string {
    let session = sessionsRepository.getByKombuseSessionId(kombuseSessionId)

    if (!session) {
      session = sessionsRepository.create({
        id: crypto.randomUUID(),
        kombuse_session_id: kombuseSessionId,
        backend_type: backendType,
        ticket_id: ticketId,
      })
    }

    // Initialize sequence counter from database if not cached
    if (!this.seqCounters.has(session.id)) {
      const nextSeq = sessionEventsRepository.getNextSeq(session.id)
      this.seqCounters.set(session.id, nextSeq)
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

    // Update session's last_event_seq
    sessionsRepository.update(sessionId, { last_event_seq: seq })
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
    sessionsRepository.update(sessionId, {
      status: 'completed',
      backend_session_id: backendSessionId,
      completed_at: new Date().toISOString(),
    })
  }

  /**
   * Mark session as failed.
   */
  failSession(sessionId: string): void {
    sessionsRepository.update(sessionId, {
      status: 'failed',
      failed_at: new Date().toISOString(),
    })
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
   * Get and increment the sequence counter for a session.
   */
  private getNextSeq(sessionId: string): number {
    const current = this.seqCounters.get(sessionId) ?? 1
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
}

// Singleton instance for convenience
export const sessionPersistenceService = new SessionPersistenceService()
