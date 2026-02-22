import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  sessionsRepository,
  setDatabase,
  ticketsRepository,
} from '@kombuse/persistence'
import { TEST_PROJECT_ID, TEST_USER_ID, seedBaseData } from '@kombuse/persistence/test-utils'
import { syncRoutes } from '../routes/sync'

vi.mock('../services/agent-execution-service', () => ({
  getPendingPermissions: vi.fn(() => []),
  computeTicketAgentStatus: vi.fn(() => ({ status: 'idle', sessionCount: 0 })),
  getActiveSessions: vi.fn(() => []),
}))

import { computeTicketAgentStatus } from '../services/agent-execution-service'

const mockComputeTicketAgentStatus = computeTicketAgentStatus as ReturnType<typeof vi.fn>

describe('GET /sync/state', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)
    seedBaseData(db)

    app = Fastify()
    await app.register(syncRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('includes idle ticket statuses in the response', async () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const session = sessionsRepository.create({ ticket_id: ticket.id })
    sessionsRepository.update(session.id, { status: 'failed' })

    mockComputeTicketAgentStatus.mockReturnValue({ status: 'idle', sessionCount: 0 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/sync/state',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const ticketStatus = body.ticketAgentStatuses.find(
      (s: { ticketNumber: number }) => s.ticketNumber === ticket.ticket_number
    )
    expect(ticketStatus).toBeDefined()
    expect(ticketStatus.status).toBe('idle')
  })
})
