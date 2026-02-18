import type { FastifyInstance } from 'fastify'
import { sessionsRepository } from '@kombuse/persistence'
import { getPendingPermissions, computeTicketAgentStatus, getActiveSessions } from '../services/agent-execution-service'

export async function syncRoutes(fastify: FastifyInstance) {
  /**
   * GET /sync/state
   * Returns current pending permissions and ticket agent statuses.
   * Called by the client on mount to recover state after a page reload.
   */
  fastify.get('/sync/state', async () => {
    const pendingPermissions = getPendingPermissions()

    // Find all tickets that have running or failed sessions
    const runningSessions = sessionsRepository.list({ status: 'running' })
    const failedSessions = sessionsRepository.list({ status: 'failed' })

    const ticketIds = new Set<number>()
    for (const session of runningSessions) {
      if (session.ticket_id != null) ticketIds.add(session.ticket_id)
    }
    for (const session of failedSessions) {
      if (session.ticket_id != null) ticketIds.add(session.ticket_id)
    }

    // Compute aggregated status per ticket
    const ticketAgentStatuses: Array<{
      ticketId: number
      status: string
      sessionCount: number
    }> = []

    for (const ticketId of ticketIds) {
      const { status, sessionCount } = computeTicketAgentStatus(ticketId)
      ticketAgentStatuses.push({ ticketId, status, sessionCount })
    }

    const activeSessions = getActiveSessions()

    return { pendingPermissions, ticketAgentStatuses, activeSessions }
  })
}
