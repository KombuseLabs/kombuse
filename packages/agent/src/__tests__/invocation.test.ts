/**
 * @fileoverview Integration tests for mock agent invocations
 *
 * Tests the full flow: event → trigger matching → invocation → mock agent execution → logs
 *
 * Run: bun run --filter @kombuse/agent test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import {
  setupTestDb,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from '@kombuse/persistence/test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  eventsRepository,
  profilesRepository,
  ticketsRepository,
} from '@kombuse/persistence'
import { agentService } from '@kombuse/services'

// Helper to create unique agent profiles
let agentCounter = 0
function createAgentProfile() {
  const id = `mock-agent-${++agentCounter}-${Date.now()}`
  profilesRepository.create({
    id,
    type: 'agent',
    name: `Mock Agent ${agentCounter}`,
    description: 'Agent for invocation testing',
  })
  return id
}

// Helper to create test tickets
let ticketCounter = 0
function createTestTicket(title: string = 'Test ticket') {
  return ticketsRepository.create({
    project_id: TEST_PROJECT_ID,
    author_id: TEST_USER_ID,
    title: `${title} ${++ticketCounter}`,
  })
}

describe('Mock Agent Invocations', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
  })

  afterEach(() => {
    cleanup()
  })

  describe('ticket.created trigger', () => {
    it('should invoke mock agent when ticket.created event is processed', async () => {
      // 1. Create agent with trigger for ticket.created
      const agentId = createAgentProfile()
      agentsRepository.create({
        id: agentId,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'You are a ticket reviewer agent.',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        is_enabled: true,
      })

      // 2. Create a ticket and corresponding event
      const ticket = createTestTicket('Test ticket for agent')
      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: ticket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: ticket.title },
      })

      // 3. Process the event - should find matching trigger and create invocation
      const invocations = agentService.processEvent(event)

      expect(invocations, 'Should create one invocation').toHaveLength(1)
      const invocation = invocations[0]!
      expect(invocation.agent_id).toBe(agentId)
      expect(invocation.status).toBe('pending')
      expect(invocation.event_id).toBe(event.id)
      expect(invocation.context).toMatchObject({
        event_type: 'ticket.created',
        ticket_id: ticket.id,
      })
    })

    it('should not invoke agent when trigger is disabled', async () => {
      // Create agent with disabled trigger
      const agentId = createAgentProfile()
      agentsRepository.create({
        id: agentId,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'Disabled agent.',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        is_enabled: false, // Disabled!
      })

      // Create ticket and event
      const ticket = createTestTicket('Should not trigger')
      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: ticket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: ticket.title },
      })

      // Process event
      const invocations = agentService.processEvent(event)

      expect(invocations, 'Should not create invocations for disabled trigger').toHaveLength(0)
    })

    it('should not invoke agent when agent is disabled', async () => {
      // Create disabled agent with enabled trigger
      const agentId = createAgentProfile()
      agentsRepository.create({
        id: agentId,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'Disabled agent.',
        is_enabled: false, // Disabled!
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        is_enabled: true,
      })

      // Create ticket and event
      const ticket = createTestTicket('Should not trigger')
      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: ticket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: ticket.title },
      })

      // Process event
      const invocations = agentService.processEvent(event)

      expect(invocations, 'Should not create invocations for disabled agent').toHaveLength(0)
    })
  })

  describe('trigger conditions', () => {
    it('should match trigger with conditions', async () => {
      // Create agent with conditional trigger
      const agentId = createAgentProfile()
      agentsRepository.create({
        id: agentId,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'High priority ticket handler.',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        is_enabled: true,
        conditions: { priority: 'high' }, // Only high priority tickets
      })

      // Create high priority ticket and event - should match
      const highPriorityTicket = createTestTicket('Urgent')
      const highPriorityEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: highPriorityTicket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: highPriorityTicket.title, priority: 'high' },
      })

      const matchingInvocations = agentService.processEvent(highPriorityEvent)
      expect(matchingInvocations, 'Should match high priority').toHaveLength(1)

      // Create low priority ticket and event - should NOT match
      const lowPriorityTicket = createTestTicket('Low priority')
      const lowPriorityEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: lowPriorityTicket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: lowPriorityTicket.title, priority: 'low' },
      })

      const nonMatchingInvocations = agentService.processEvent(lowPriorityEvent)
      expect(nonMatchingInvocations, 'Should not match low priority').toHaveLength(0)
    })
  })

  describe('multiple triggers', () => {
    it('should invoke multiple agents for the same event', async () => {
      // Create two agents with triggers for ticket.created
      const agent1Id = createAgentProfile()
      agentsRepository.create({
        id: agent1Id,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'First agent.',
        is_enabled: true,
      })
      agentTriggersRepository.create({
        agent_id: agent1Id,
        event_type: 'ticket.created',
        is_enabled: true,
        priority: 10,
      })

      const agent2Id = createAgentProfile()
      agentsRepository.create({
        id: agent2Id,
        name: 'Test Agent',
        description: 'Test',
        system_prompt: 'Second agent.',
        is_enabled: true,
      })
      agentTriggersRepository.create({
        agent_id: agent2Id,
        event_type: 'ticket.created',
        is_enabled: true,
        priority: 5,
      })

      // Create ticket and event
      const ticket = createTestTicket('Multi-agent ticket')
      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: ticket.id,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { title: ticket.title },
      })

      // Process event
      const invocations = agentService.processEvent(event)

      expect(invocations, 'Should create invocations for both agents').toHaveLength(2)

      // Higher priority should be first
      expect(invocations[0]!.agent_id).toBe(agent1Id)
      expect(invocations[1]!.agent_id).toBe(agent2Id)

      // Both invocations should be pending, ready for execution via chat infrastructure
      expect(invocations[0]!.status).toBe('pending')
      expect(invocations[1]!.status).toBe('pending')
    })
  })
})
