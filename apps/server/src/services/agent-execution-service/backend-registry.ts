import { agentInvocationsRepository, sessionsRepository, ticketsRepository } from '@kombuse/persistence'
import type { SessionStateMachine } from '@kombuse/services'
import { BACKEND_TYPES, type ActiveSessionInfo, type AgentActivityStatus, type AgentBackend, type BackendType, type ServerMessage, type Session, type SessionMetadata } from '@kombuse/types'
import { wsHub } from '../../websocket/hub'
import {
  activeBackends,
  activeSessionTurns,
  backendIdleTimeouts,
  BACKEND_IDLE_TIMEOUT_MS,
  clearPendingPermissionsForSession,
  isSessionTurnActive,
  resolveBackendIdleTimeoutMs,
  setSessionTurnActive,
} from './runtime-state'
import type { AgentExecutionDependencies } from './types'

interface BackendRegistryHooks {
  getDefaultStateMachine: () => SessionStateMachine
  getDefaultDependencies: () => AgentExecutionDependencies
}

let hooks: BackendRegistryHooks | undefined

export function configureBackendRegistry(nextHooks: BackendRegistryHooks): void {
  hooks = nextHooks
}

function getDefaultStateMachine(): SessionStateMachine | undefined {
  try {
    return hooks?.getDefaultStateMachine()
  } catch {
    return undefined
  }
}

function getDefaultDependencies(): AgentExecutionDependencies | undefined {
  try {
    return hooks?.getDefaultDependencies()
  } catch {
    return undefined
  }
}

function getSessionByKombuseId(kombuseSessionId: string): Session | null {
  const deps = getDefaultDependencies()
  if (deps) {
    return deps.sessionPersistence.getSessionByKombuseId(kombuseSessionId)
  }

  const repo = sessionsRepository as unknown as {
    getByKombuseSessionId?: (sessionId: string) => Session | null | undefined
  }
  return repo.getByKombuseSessionId?.(kombuseSessionId) ?? null
}

/**
 * Clear the idle timeout for a persistent backend.
 */
export function clearBackendIdleTimeout(sessionId: string): void {
  const existing = backendIdleTimeouts.get(sessionId)
  if (existing) {
    clearTimeout(existing)
    backendIdleTimeouts.delete(sessionId)
  }
}

/**
 * Unregister a backend.
 */
export function unregisterBackend(sessionId: string): void {
  activeBackends.delete(sessionId)
  clearBackendIdleTimeout(sessionId)
  activeSessionTurns.delete(sessionId)
  clearPendingPermissionsForSession(sessionId)
}

/**
 * Reset the idle timeout for a persistent backend.
 * Called on successful completion and on each follow-up message.
 */
export function resetBackendIdleTimeout(sessionId: string): void {
  clearBackendIdleTimeout(sessionId)

  const timeoutMs = resolveBackendIdleTimeoutMs()
  if (timeoutMs === null) {
    return
  }

  const timer = setTimeout(() => {
    if (isSessionTurnActive(sessionId)) {
      resetBackendIdleTimeout(sessionId)
      return
    }

    const session = getSessionByKombuseId(sessionId)
    if (session && (session.status === 'running' || session.status === 'pending')) {
      resetBackendIdleTimeout(sessionId)
      return
    }

    const backend = activeBackends.get(sessionId)
    if (backend?.isRunning()) {
      void backend.stop()
    }

    if (session?.status === 'completed') {
      const stateMachine = getDefaultStateMachine()
      if (stateMachine) {
        try {
          stateMachine.transition(session.id, 'stop', {
            kombuseSessionId: sessionId,
            ticketId: session.ticket_id ?? undefined,
            metadataPatch: {
              terminal_reason: 'idle_timeout',
              terminal_source: 'idle_timeout',
              terminal_at: new Date().toISOString(),
            },
          })
        } catch {
          unregisterBackend(sessionId)
        }
      } else {
        unregisterBackend(sessionId)
      }
    } else {
      unregisterBackend(sessionId)
    }
    backendIdleTimeouts.delete(sessionId)

    const ticketRecord = typeof session?.ticket_id === 'number'
      ? ticketsRepository._getInternal(session.ticket_id) ?? undefined
      : undefined
    const completeMsg: ServerMessage = {
      type: 'agent.complete',
      kombuseSessionId: sessionId,
      ticketNumber: ticketRecord?.ticket_number ?? undefined,
      projectId: session?.project_id ?? undefined,
      status: 'stopped',
      reason: 'idle_timeout',
      errorMessage: 'Session stopped after inactivity timeout',
    }
    wsHub.broadcastAgentMessage(sessionId, completeMsg)
    wsHub.broadcastToTopic('*', completeMsg)
    if (session?.ticket_id) {
      broadcastTicketAgentStatus(session.ticket_id)
    }
  }, timeoutMs)
  if (timer.unref) timer.unref()
  backendIdleTimeouts.set(sessionId, timer)
}

/**
 * Reschedule all active idle timeouts with the current timeout setting.
 * Called when the user changes the backend idle timeout setting.
 */
export function rescheduleAllIdleTimeouts(): void {
  const sessionIds = [...backendIdleTimeouts.keys()]
  for (const sessionId of sessionIds) {
    if (isSessionTurnActive(sessionId)) continue
    resetBackendIdleTimeout(sessionId)
  }
}

/**
 * Register a backend for permission response routing.
 */
export function registerBackend(sessionId: string, backend: AgentBackend): void {
  activeBackends.set(sessionId, backend)
}

/**
 * Stop a single agent session by its kombuse session ID.
 * Returns true if the backend was found and stop was requested, false otherwise.
 */
export function stopAgentSession(kombuseSessionId: string): boolean {
  const backend = activeBackends.get(kombuseSessionId)
  if (!backend) {
    return false
  }

  clearBackendIdleTimeout(kombuseSessionId)
  setSessionTurnActive(kombuseSessionId, false)
  void backend.stop().catch(() => {})
  return true
}

/**
 * Stop all active backends (for graceful server shutdown).
 */
export function stopAllActiveBackends(): void {
  for (const [sessionId, backend] of activeBackends) {
    void backend.stop().catch(() => {})
    clearBackendIdleTimeout(sessionId)
    activeSessionTurns.delete(sessionId)
  }
  activeBackends.clear()
  backendIdleTimeouts.clear()
  activeSessionTurns.clear()

  const dependencies = getDefaultDependencies()
  if (dependencies) {
    cleanupOrphanedSessions(
      {
        source: 'shutdown_cleanup',
        reason: 'server_shutdown',
        includeAllSessions: true,
      },
      dependencies
    )
  }
}

/**
 * Stop only active Codex backends so Codex MCP config changes take effect
 * on the next Codex session start.
 */
export function stopActiveCodexBackends(): number {
  let stoppedCount = 0

  for (const [sessionId, backend] of activeBackends) {
    if (backend.name !== BACKEND_TYPES.CODEX) {
      continue
    }

    void backend.stop().catch(() => {})

    clearBackendIdleTimeout(sessionId)
    activeSessionTurns.delete(sessionId)
    activeBackends.delete(sessionId)
    stoppedCount += 1
  }

  return stoppedCount
}

/**
 * Stop only active Claude Code backends so Claude Code MCP config changes take effect
 * on the next Claude Code session start.
 */
export function stopActiveClaudeCodeBackends(): number {
  let stoppedCount = 0

  for (const [sessionId, backend] of activeBackends) {
    if (backend.name !== BACKEND_TYPES.CLAUDE_CODE) {
      continue
    }

    void backend.stop().catch(() => {})

    clearBackendIdleTimeout(sessionId)
    activeSessionTurns.delete(sessionId)
    activeBackends.delete(sessionId)
    stoppedCount += 1
  }

  return stoppedCount
}

/**
 * Compute aggregated agent status for a ticket.
 * Uses DB status (running/pending) as the single source of truth.
 * Only considers failures more recent than the last completed session
 * to avoid permanent error indicators from old historical failures.
 */
export function computeTicketAgentStatus(ticketId: number): {
  status: AgentActivityStatus
  sessionCount: number
} {
  const runningSessions = sessionsRepository.listByTicket(ticketId, { status: 'running' })
  const pendingSessions = sessionsRepository.listByTicket(ticketId, { status: 'pending' })
  const activeSessions = [...runningSessions, ...pendingSessions]
  const failedSessions = sessionsRepository.listByTicket(ticketId, { status: 'failed' })

  const completedSessions = sessionsRepository.listByTicket(ticketId, { status: 'completed', limit: 1 })
  const lastCompletedAt = completedSessions[0]?.completed_at

  const recentFailures = lastCompletedAt
    ? failedSessions.filter((session) => (session.failed_at ?? session.updated_at) > lastCompletedAt)
    : failedSessions

  let status: AgentActivityStatus = 'idle'
  if (recentFailures.length > 0) {
    status = 'error'
  }
  if (activeSessions.length > 0) {
    status = 'running'
  }

  return { status, sessionCount: activeSessions.length }
}

/**
 * Broadcast aggregated agent status for a ticket to all connected clients.
 */
export function broadcastTicketAgentStatus(ticketId: number): void {
  const ticketRecord = ticketsRepository._getInternal(ticketId)
  if (!ticketRecord) return
  const { status, sessionCount } = computeTicketAgentStatus(ticketId)
  wsHub.broadcastToTopic('*', {
    type: 'ticket.agent_status',
    ticketNumber: ticketRecord.ticket_number,
    projectId: ticketRecord.project_id,
    status,
    sessionCount,
  })
}

/**
 * Return enriched info about currently active sessions for the Active Agents Indicator.
 * Uses DB status (running/pending) as the single source of truth.
 */
export function getActiveSessions(): ActiveSessionInfo[] {
  const runningSessions = sessionsRepository.list({ status: 'running' })
  const pendingSessions = sessionsRepository.list({ status: 'pending' })
  const results: ActiveSessionInfo[] = []

  for (const session of [...runningSessions, ...pendingSessions]) {
    if (!session.kombuse_session_id) {
      continue
    }
    const effectiveBackend =
      session.metadata?.effective_backend
      ?? session.effective_backend
      ?? session.backend_type
      ?? undefined
    const appliedModel =
      session.metadata?.applied_model
      ?? session.applied_model
      ?? undefined
    const ticketId = session.ticket_id ?? undefined
    const ticket = typeof ticketId === 'number'
      ? ticketsRepository._getInternal(ticketId) ?? undefined
      : undefined
    const ticketTitle = ticket?.title ?? undefined
    const projectId = session.project_id ?? undefined
    results.push({
      kombuseSessionId: session.kombuse_session_id,
      agentName: session.agent_name ?? 'Agent',
      ticketNumber: ticket?.ticket_number ?? undefined,
      ticketTitle,
      projectId,
      effectiveBackend,
      appliedModel,
      startedAt: session.started_at,
    })
  }

  return results
}

type ForcedAbortSource =
  | 'orphan_cleanup'
  | 'startup_cleanup'
  | 'shutdown_cleanup'

interface CleanupOrphanedSessionsOptions {
  source?: ForcedAbortSource
  reason?: string
  includeAllSessions?: boolean
  minInactiveMs?: number
}

/**
 * Orphan cleanup only aborts sessions that have been inactive for this long.
 * This avoids false positives when another process (or a freshly re-registered
 * backend) is actively streaming events but not present in this process map yet.
 */
const DEFAULT_ORPHAN_MIN_INACTIVE_MS = 10 * 60 * 1000

function getSessionBackendForEvent(session: Session): BackendType {
  return session.backend_type ?? BACKEND_TYPES.CLAUDE_CODE
}

function emitForcedAbortDiagnosticEvent(
  session: Session,
  dependencies: AgentExecutionDependencies,
  source: ForcedAbortSource,
  reason: string,
  terminalAt: string,
  note?: string,
): void {
  dependencies.sessionPersistence.persistEvent(session.id, {
    type: 'raw',
    eventId: crypto.randomUUID(),
    backend: getSessionBackendForEvent(session),
    timestamp: Date.now(),
    sourceType: 'server_session_cleanup',
    data: {
      action: 'forced_abort',
      source,
      reason,
      terminal_at: terminalAt,
      previous_status: session.status,
      kombuse_session_id: session.kombuse_session_id,
      backend_session_id: session.backend_session_id,
      ticket_id: session.ticket_id,
      note,
    },
  })
}

function abortSessionWithDiagnostics(
  session: Session,
  dependencies: AgentExecutionDependencies,
  source: ForcedAbortSource,
  reason: string,
): void {
  const terminalAt = new Date().toISOString()
  const metadataPatch: Partial<SessionMetadata> = {
    terminal_reason: reason,
    terminal_source: source,
    terminal_at: terminalAt,
  }

  emitForcedAbortDiagnosticEvent(
    session,
    dependencies,
    source,
    reason,
    terminalAt
  )

  if (session.kombuse_session_id) {
    try {
      dependencies.stateMachine.transition(session.id, 'abort', {
        kombuseSessionId: session.kombuse_session_id,
        ticketId: session.ticket_id ?? undefined,
        backendSessionId: session.backend_session_id ?? undefined,
        error: reason,
        metadataPatch,
      })
      agentInvocationsRepository.failBySessionId(session.id, reason)
      return
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : String(error)
      metadataPatch.terminal_error = errorText
      emitForcedAbortDiagnosticEvent(
        session,
        dependencies,
        source,
        `${reason}_state_machine_fallback`,
        terminalAt,
        errorText,
      )

      const latestSession = dependencies.sessionPersistence.getSession(session.id)
      if (latestSession && latestSession.status !== 'running' && latestSession.status !== 'pending') {
        return
      }
    }
  }

  dependencies.sessionPersistence.abortSession(
    session.id,
    session.backend_session_id ?? undefined
  )
  dependencies.sessionPersistence.setMetadata(session.id, metadataPatch)
  agentInvocationsRepository.failBySessionId(session.id, reason)
}

/**
 * Detect and abort sessions stuck in 'running'/'pending' with no live backend.
 * Returns the number of orphaned sessions cleaned up.
 */
export function cleanupOrphanedSessions(
  options: CleanupOrphanedSessionsOptions = {},
  dependencies?: AgentExecutionDependencies,
): number {
  const resolvedDependencies = dependencies ?? getDefaultDependencies()
  if (!resolvedDependencies) {
    return 0
  }

  const source = options.source ?? 'orphan_cleanup'
  const reason = options.reason ?? 'backend_unavailable'
  const includeAllSessions = options.includeAllSessions ?? false
  const minInactiveMs = includeAllSessions
    ? 0
    : Math.max(0, options.minInactiveMs ?? DEFAULT_ORPHAN_MIN_INACTIVE_MS)
  const nowMs = Date.now()
  const runningSessions = sessionsRepository.list({ status: 'running' })
  const pendingSessions = sessionsRepository.list({ status: 'pending' })
  let cleaned = 0
  const affectedTickets = new Set<number>()

  for (const session of [...runningSessions, ...pendingSessions]) {
    const isOrphaned = includeAllSessions
      || !session.kombuse_session_id
      || !activeBackends.has(session.kombuse_session_id)
    if (!isOrphaned) {
      continue
    }

    if (!includeAllSessions) {
      const lastUpdateMs = Date.parse(session.updated_at)
      const inactivityMs = Number.isFinite(lastUpdateMs)
        ? Math.max(0, nowMs - lastUpdateMs)
        : Number.POSITIVE_INFINITY
      if (inactivityMs < minInactiveMs) {
        continue
      }
    }

    abortSessionWithDiagnostics(session, resolvedDependencies, source, reason)

    if (session.kombuse_session_id) {
      const abortTicket = typeof session.ticket_id === 'number'
        ? ticketsRepository._getInternal(session.ticket_id) ?? undefined
        : undefined
      const completeMsg: ServerMessage = {
        type: 'agent.complete',
        kombuseSessionId: session.kombuse_session_id,
        ticketNumber: abortTicket?.ticket_number ?? undefined,
        projectId: session.project_id ?? undefined,
        status: 'aborted',
        reason,
        errorMessage: reason,
      }
      wsHub.broadcastAgentMessage(session.kombuse_session_id, completeMsg)
      wsHub.broadcastToTopic('*', completeMsg)
    }

    if (session.ticket_id) affectedTickets.add(session.ticket_id)
    cleaned++
  }

  for (const ticketId of affectedTickets) {
    broadcastTicketAgentStatus(ticketId)
  }

  return cleaned
}
