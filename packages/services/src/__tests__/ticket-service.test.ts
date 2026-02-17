import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupTestDb,
  TEST_USER_ID,
  TEST_PROJECT_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
  ticketsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { ticketService } from '../ticket-service'
import { MAX_CHAIN_DEPTH } from '../session-preferences-service'

let agentCounter = 0
function createAgentProfile() {
  const id = `agent-${++agentCounter}-${Date.now()}`
  profilesRepository.create({
    id,
    type: 'agent',
    name: `Test Agent ${agentCounter}`,
  })
  return id
}

describe('ticketService', () => {
  let cleanup: () => void
  let agentId: string
  let triggerId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup

    const profileId = createAgentProfile()
    agentsRepository.create({ id: profileId, name: 'Test Agent', description: 'Test', system_prompt: 'Test agent' })
    agentId = profileId

    const trigger = agentTriggersRepository.create({
      agent_id: agentId,
      event_type: 'ticket.created',
    })
    triggerId = trigger.id
  })

  afterEach(() => {
    cleanup()
  })

  describe('getWithRelations - loop_protection_tripped', () => {
    it('should set loop_protection_tripped to false when no invocations exist', () => {
      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Test ticket',
      })

      const result = ticketService.getWithRelations(ticket.id)
      expect(result).not.toBeNull()
      expect(result!.loop_protection_tripped).toBe(false)
    })

    it('should set loop_protection_tripped to false when count is below threshold', () => {
      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Test ticket',
      })

      for (let i = 0; i < MAX_CHAIN_DEPTH - 1; i++) {
        agentInvocationsRepository.create({
          agent_id: agentId,
          trigger_id: triggerId,
          context: { ticket_id: ticket.id },
        })
      }

      const result = ticketService.getWithRelations(ticket.id)
      expect(result!.loop_protection_tripped).toBe(false)
    })

    it('should set loop_protection_tripped to true when count equals threshold', () => {
      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Test ticket',
      })

      for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
        agentInvocationsRepository.create({
          agent_id: agentId,
          trigger_id: triggerId,
          context: { ticket_id: ticket.id },
        })
      }

      const result = ticketService.getWithRelations(ticket.id)
      expect(result!.loop_protection_tripped).toBe(true)
    })

    it('should not set loop_protection_tripped when loop_protection_enabled is false', () => {
      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Test ticket',
        loop_protection_enabled: false,
      })

      for (let i = 0; i < MAX_CHAIN_DEPTH + 5; i++) {
        agentInvocationsRepository.create({
          agent_id: agentId,
          trigger_id: triggerId,
          context: { ticket_id: ticket.id },
        })
      }

      const result = ticketService.getWithRelations(ticket.id)
      expect(result!.loop_protection_tripped).toBeUndefined()
    })
  })
})
