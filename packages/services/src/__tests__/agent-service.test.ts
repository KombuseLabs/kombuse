/**
 * @fileoverview Tests for agent service mention trigger behavior
 *
 * Run: bun run --filter @kombuse/services test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupTestDb,
  TEST_USER_ID,
  TEST_PROJECT_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  eventsRepository,
  ticketsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { agentService } from '../agent-service'

// Helper to create unique agent profiles
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

describe('agentService', () => {
  let cleanup: () => void
  let agentId: string
  let testTicketId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup

    // Create an agent profile + agent record
    const profileId = createAgentProfile()
    const agent = agentsRepository.create({
      id: profileId,
      system_prompt: 'Test agent',
      is_enabled: true,
    })
    agentId = agent.id

    // Create a test ticket
    const ticket = ticketsRepository.create({
      title: 'Test Ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    testTicketId = ticket.id
  })

  afterEach(() => {
    cleanup()
  })

  describe('createTrigger', () => {
    it('should reject mention.created triggers without conditions', () => {
      expect(() =>
        agentService.createTrigger({
          agent_id: agentId,
          event_type: 'mention.created',
        })
      ).toThrow('mention.created triggers require explicit conditions')
    })

    it('should allow mention.created triggers with conditions', () => {
      const trigger = agentService.createTrigger({
        agent_id: agentId,
        event_type: 'mention.created',
        conditions: { mention_type: 'profile' },
      })

      expect(trigger.event_type).toBe('mention.created')
      expect(trigger.conditions).toEqual({ mention_type: 'profile' })
    })

    it('should allow non-mention triggers without conditions', () => {
      const trigger = agentService.createTrigger({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      expect(trigger.event_type).toBe('ticket.created')
    })
  })

  describe('updateTrigger', () => {
    it('should reject updating to mention.created without conditions', () => {
      const trigger = agentService.createTrigger({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      expect(() =>
        agentService.updateTrigger(trigger.id, {
          event_type: 'mention.created',
        })
      ).toThrow('mention.created triggers require explicit conditions')
    })

    it('should reject removing conditions from mention.created trigger', () => {
      const trigger = agentService.createTrigger({
        agent_id: agentId,
        event_type: 'mention.created',
        conditions: { mention_type: 'profile' },
      })

      expect(() =>
        agentService.updateTrigger(trigger.id, {
          conditions: null,
        })
      ).toThrow('mention.created triggers require explicit conditions')
    })
  })

  describe('findMatchingTriggers', () => {
    it('should not match mention.created trigger with no conditions', () => {
      // Create trigger directly in the repository to bypass service validation
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'mention.created',
        is_enabled: true,
      })

      const event = eventsRepository.create({
        event_type: 'mention.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { mention_type: 'profile', mentioned_profile_id: agentId },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Conditionless mention.created trigger should not match').toHaveLength(0)
    })

    it('should match mention.created trigger with matching conditions', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'mention.created',
        conditions: { mention_type: 'profile' },
      })

      const event = eventsRepository.create({
        event_type: 'mention.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { mention_type: 'profile', mentioned_profile_id: agentId },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should not match mention.created trigger when conditions mismatch', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'mention.created',
        conditions: { mention_type: 'profile' },
      })

      const event = eventsRepository.create({
        event_type: 'mention.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { mention_type: 'ticket', mentioned_ticket_id: 42 },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Profile-only trigger should not match ticket mention').toHaveLength(0)
    })

    it('should match ticket mention trigger with ticket conditions', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'mention.created',
        conditions: { mention_type: 'ticket' },
      })

      const event = eventsRepository.create({
        event_type: 'mention.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { mention_type: 'ticket', mentioned_ticket_id: 42 },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })
  })
})
