import type { SessionStatus, SessionMetadata } from '@kombuse/types'
import type { ISessionPersistenceService } from './session-persistence-service'

/**
 * All valid transition events the state machine accepts.
 */
export type SessionTransitionEvent =
  | 'start'       // pending -> running
  | 'complete'    // running -> completed
  | 'fail'        // running -> failed
  | 'abort'       // running|pending -> aborted
  | 'stop'        // completed -> stopped (idle timeout)
  | 'continue'    // completed|failed|running -> running (resume/retry/reuse)

/**
 * Context passed with each transition, providing data for side effects.
 */
export interface TransitionContext {
  kombuseSessionId: string
  ticketId?: number
  backendSessionId?: string
  backend?: { name: string; isRunning(): boolean }
  invocationId?: number
  error?: string
  metadataPatch?: Partial<SessionMetadata>
}

/**
 * External dependencies injected into the state machine.
 */
export interface StateMachineDeps {
  sessionPersistence: Pick<
    ISessionPersistenceService,
    'getSession' | 'markSessionRunning' | 'completeSession' | 'failSession' | 'abortSession' | 'updateStatus' | 'getMetadata' | 'setMetadata'
  >
  backends: {
    register(sessionId: string, backend: TransitionContext['backend']): void
    unregister(sessionId: string): void
    resetIdleTimeout(sessionId: string): void
    clearIdleTimeout(sessionId: string): void
  }
  invocations: {
    markCompleted(invocationId: number): void
    markFailed(invocationId: number, error: string): void
  }
}

/**
 * Allowed transitions map.
 * Key: from status. Value: map of event -> target status.
 */
const TRANSITIONS: Record<SessionStatus, Partial<Record<SessionTransitionEvent, SessionStatus>>> = {
  pending: {
    start: 'running',
    abort: 'aborted',
  },
  running: {
    complete: 'completed',
    fail: 'failed',
    abort: 'aborted',
    continue: 'running', // no-op re-entry for persistent backend reuse
  },
  completed: {
    continue: 'running',
    stop: 'stopped',
  },
  failed: {
    continue: 'running',
  },
  aborted: {},
  stopped: {},
}

export class SessionStateMachine {
  constructor(private deps: StateMachineDeps) {}

  /**
   * Execute a state transition with all side effects.
   * Throws if the transition is invalid from the current state.
   */
  transition(sessionId: string, event: SessionTransitionEvent, ctx: TransitionContext): void {
    const session = this.deps.sessionPersistence.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const currentStatus = session.status
    const targetStatus = TRANSITIONS[currentStatus]?.[event]

    if (!targetStatus) {
      throw new Error(
        `Invalid transition: cannot apply '${event}' to session in '${currentStatus}' state`
      )
    }

    this.executeTransition(sessionId, currentStatus, targetStatus, event, ctx)

    if (ctx.metadataPatch) {
      this.setMetadata(sessionId, ctx.metadataPatch)
    }
  }

  getMetadata(sessionId: string): SessionMetadata {
    return this.deps.sessionPersistence.getMetadata(sessionId)
  }

  setMetadata(sessionId: string, patch: Partial<SessionMetadata>): void {
    this.deps.sessionPersistence.setMetadata(sessionId, patch)
  }

  private executeTransition(
    sessionId: string,
    from: SessionStatus,
    to: SessionStatus,
    event: SessionTransitionEvent,
    ctx: TransitionContext
  ): void {
    switch (event) {
      case 'start': {
        // pending -> running
        this.deps.sessionPersistence.markSessionRunning(sessionId)
        if (ctx.backend) {
          this.deps.backends.register(ctx.kombuseSessionId, ctx.backend)
        }
        this.deps.backends.resetIdleTimeout(ctx.kombuseSessionId)
        break
      }

      case 'complete': {
        // running -> completed
        this.deps.sessionPersistence.completeSession(sessionId, ctx.backendSessionId)
        if (ctx.invocationId) {
          this.deps.invocations.markCompleted(ctx.invocationId)
        }
        this.deps.backends.resetIdleTimeout(ctx.kombuseSessionId)
        break
      }

      case 'fail': {
        // running -> failed
        this.deps.sessionPersistence.failSession(sessionId, ctx.backendSessionId)
        if (ctx.invocationId) {
          this.deps.invocations.markFailed(ctx.invocationId, ctx.error ?? 'Unknown error')
        }
        this.deps.backends.unregister(ctx.kombuseSessionId)
        this.deps.backends.clearIdleTimeout(ctx.kombuseSessionId)
        break
      }

      case 'abort': {
        // running|pending -> aborted
        this.deps.sessionPersistence.abortSession(sessionId, ctx.backendSessionId)
        this.deps.backends.unregister(ctx.kombuseSessionId)
        this.deps.backends.clearIdleTimeout(ctx.kombuseSessionId)
        if (ctx.invocationId) {
          this.deps.invocations.markFailed(ctx.invocationId, 'session_aborted')
        }
        break
      }

      case 'stop': {
        // completed|failed -> stopped (idle timeout)
        this.deps.sessionPersistence.updateStatus(sessionId, 'stopped')
        this.deps.backends.unregister(ctx.kombuseSessionId)
        this.deps.backends.clearIdleTimeout(ctx.kombuseSessionId)
        break
      }

      case 'continue': {
        if (from === 'running') {
          // Re-entry while already running.
          // If a backend is provided, (re)register it so cleanup can track
          // this process as the active owner for the session.
          if (ctx.backend) {
            this.deps.backends.register(ctx.kombuseSessionId, ctx.backend)
          }
          this.deps.backends.resetIdleTimeout(ctx.kombuseSessionId)
        } else {
          // completed|failed -> running (resume/retry)
          this.deps.sessionPersistence.markSessionRunning(sessionId)
          if (ctx.backend) {
            this.deps.backends.register(ctx.kombuseSessionId, ctx.backend)
          }
          this.deps.backends.resetIdleTimeout(ctx.kombuseSessionId)
        }
        break
      }
    }
  }
}
