/**
 * @fileoverview Tests for agent service trigger behavior
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
  agentInvocationsRepository,
  eventsRepository,
  ticketsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { agentService } from '../agent-service'
import { UUID_REGEX } from '@kombuse/types'

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
      name: `Test Agent ${agentCounter}`,
      description: 'Test agent description',
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

    it('should match agent.completed trigger with no conditions', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'agent.completed',
      })

      const event = eventsRepository.create({
        event_type: 'agent.completed',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: { agent_id: agentId, invocation_id: 1, completing_agent_id: agentId, completing_agent_type: 'kombuse' },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should match exclude_ condition (negation) — agent not excluded', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'agent.completed',
        conditions: { exclude_agent_id: 'pipeline-orchestrator' },
      })

      const event = eventsRepository.create({
        event_type: 'agent.completed',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: { agent_id: 'coding-agent', invocation_id: 1 },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should match because completing agent is not the excluded one').toHaveLength(1)
    })

    it('should reject exclude_ condition (negation) — agent is excluded', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'agent.completed',
        conditions: { exclude_agent_id: 'pipeline-orchestrator' },
      })

      const event = eventsRepository.create({
        event_type: 'agent.completed',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: { agent_id: 'pipeline-orchestrator', invocation_id: 1 },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should not match because completing agent is the excluded one').toHaveLength(0)
    })

    it('should match array containment — changes includes target field', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'ticket.updated',
        conditions: { changes: 'status' },
      })

      const event = eventsRepository.create({
        event_type: 'ticket.updated',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { changes: ['status', 'title'] },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should match because changes array includes status').toHaveLength(1)
    })

    it('should reject array containment — changes does not include target field', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'ticket.updated',
        conditions: { changes: 'status' },
      })

      const event = eventsRepository.create({
        event_type: 'ticket.updated',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { changes: ['title', 'body'] },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should not match because changes array does not include status').toHaveLength(0)
    })

    it('should match author_type condition on comment.added', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.added',
        conditions: { author_type: 'user' },
      })

      const event = eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { comment_id: 1, ticket_id: testTicketId, author_type: 'user' },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should reject author_type condition mismatch on comment.added', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.added',
        conditions: { author_type: 'user' },
      })

      const event = eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: { comment_id: 1, ticket_id: testTicketId, author_type: 'agent' },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should not match because author_type is agent, not user').toHaveLength(0)
    })

    it('should match author_type condition on comment.edited', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.edited',
        conditions: { author_type: 'user' },
      })

      const event = eventsRepository.create({
        event_type: 'comment.edited',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: { comment_id: 1, author_type: 'user' },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should reject author_type condition mismatch on comment.edited', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.edited',
        conditions: { author_type: 'user' },
      })

      const event = eventsRepository.create({
        event_type: 'comment.edited',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: { comment_id: 1, author_type: 'agent' },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should not match because author_type is agent, not user').toHaveLength(0)
    })

    // ============================================
    // condition-side array matching (author_id)
    // ============================================

    it('should match when condition author_id array includes payload author_id', () => {
      const specificAgent1 = createAgentProfile()
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.added',
        conditions: { author_type: 'agent', author_id: [specificAgent1, 'specific-agent-2'] },
      })

      const event = eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: specificAgent1,
        actor_type: 'agent',
        payload: { comment_id: 1, ticket_id: testTicketId, author_type: 'agent', author_id: specificAgent1 },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should match because author_id is in the condition array').toHaveLength(1)
    })

    it('should reject when condition author_id array does not include payload author_id', () => {
      const otherAgent = createAgentProfile()
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.added',
        conditions: { author_type: 'agent', author_id: ['specific-agent-1', 'specific-agent-2'] },
      })

      const event = eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: otherAgent,
        actor_type: 'agent',
        payload: { comment_id: 1, ticket_id: testTicketId, author_type: 'agent', author_id: otherAgent },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should not match because author_id is not in the condition array').toHaveLength(0)
    })

    it('should match author_type agent without author_id array for any agent', () => {
      const anyAgent = createAgentProfile()
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'comment.added',
        conditions: { author_type: 'agent' },
      })

      const event = eventsRepository.create({
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: anyAgent,
        actor_type: 'agent',
        payload: { comment_id: 1, ticket_id: testTicketId, author_type: 'agent', author_id: anyAgent },
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Should match any agent when no author_id condition specified').toHaveLength(1)
    })

    // ============================================
    // allowed_invokers ACL tests
    // ============================================

    it('should allow all when allowed_invokers is null (default)', () => {
      agentService.createTrigger({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Null allowed_invokers should allow all').toHaveLength(1)
    })

    it('should allow all when allowed_invokers is empty array', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Empty allowed_invokers should allow all').toHaveLength(1)
    })

    it('should allow user when allowed_invokers includes { type: "user" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'user' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should reject agent when allowed_invokers only includes { type: "user" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'user' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Agent should be rejected when only users are allowed').toHaveLength(0)
    })

    it('should allow specific agent when allowed_invokers includes matching agent_id', () => {
      const otherAgentId = createAgentProfile()
      agentsRepository.create({
        id: otherAgentId,
        name: 'Other Agent',
        description: 'Another test agent',
        system_prompt: 'Test',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_id: otherAgentId }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: otherAgentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should reject non-matching agent when allowed_invokers specifies a different agent_id', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_id: 'specific-agent-id' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Non-matching agent should be rejected').toHaveLength(0)
    })

    it('should allow any agent when allowed_invokers includes { type: "agent" } without agent_id', () => {
      const otherAgentId = createAgentProfile()
      agentsRepository.create({
        id: otherAgentId,
        name: 'Any Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: otherAgentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches).toHaveLength(1)
    })

    it('should reject user when allowed_invokers only includes { type: "agent" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'User should be rejected when only agents are allowed').toHaveLength(0)
    })

    it('should allow everything when allowed_invokers includes { type: "any" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'any' }],
      })

      const agentEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: agentId,
        actor_type: 'agent',
        payload: {},
      })

      const userEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      expect(agentService.findMatchingTriggers(agentEvent)).toHaveLength(1)
      expect(agentService.findMatchingTriggers(userEvent)).toHaveLength(1)
    })

    it('should use OR semantics: match if any rule matches', () => {
      const allowedAgentId = createAgentProfile()
      agentsRepository.create({
        id: allowedAgentId,
        name: 'Allowed Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
      })

      const wrongAgentId = createAgentProfile()
      agentsRepository.create({
        id: wrongAgentId,
        name: 'Wrong Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [
          { type: 'user' },
          { type: 'agent', agent_id: allowedAgentId },
        ],
      })

      const userEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(userEvent), 'User should match via first rule').toHaveLength(1)

      const allowedAgentEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: allowedAgentId,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(allowedAgentEvent), 'Specific agent should match via second rule').toHaveLength(1)

      const wrongAgentEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: wrongAgentId,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(wrongAgentEvent), 'Wrong agent should not match any rule').toHaveLength(0)
    })

    it('should allow system events when allowed_invokers includes { type: "system" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'system' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_type: 'system',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'System events should match system rule').toHaveLength(1)
    })

    it('should reject user when allowed_invokers only includes { type: "system" }', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'system' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'User should be rejected when only system is allowed').toHaveLength(0)
    })

    it('should allow agent when agent_type matches config.type', () => {
      const coderAgentId = createAgentProfile()
      agentsRepository.create({
        id: coderAgentId,
        name: 'Coder Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'coder' },
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_type: 'coder' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: coderAgentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Agent with matching config.type should be allowed').toHaveLength(1)
    })

    it('should reject agent when agent_type does not match config.type', () => {
      const triageAgentId = createAgentProfile()
      agentsRepository.create({
        id: triageAgentId,
        name: 'Triage Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'triage' },
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_type: 'coder' }],
      })

      const event = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: triageAgentId,
        actor_type: 'agent',
        payload: {},
      })

      const matches = agentService.findMatchingTriggers(event)
      expect(matches, 'Triage agent should not match coder agent_type rule').toHaveLength(0)
    })

    it('should use AND semantics when both agent_id and agent_type are specified', () => {
      const coderAgentId = createAgentProfile()
      agentsRepository.create({
        id: coderAgentId,
        name: 'Coder Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'coder' },
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_id: coderAgentId, agent_type: 'coder' }],
      })

      // Matching: right agent_id + right config.type
      const matchingEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: coderAgentId,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(matchingEvent), 'Both agent_id and agent_type match').toHaveLength(1)

      // Wrong agent_id
      const wrongIdAgentId = createAgentProfile()
      agentsRepository.create({
        id: wrongIdAgentId,
        name: 'Wrong ID Agent',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'coder' },
      })

      const wrongIdEvent = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: wrongIdAgentId,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(wrongIdEvent), 'Wrong agent_id should fail AND check').toHaveLength(0)
    })

    it('should match any agent of the specified type when agent_type is set without agent_id', () => {
      const coder1 = createAgentProfile()
      agentsRepository.create({
        id: coder1,
        name: 'Coder 1',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'coder' },
      })

      const coder2 = createAgentProfile()
      agentsRepository.create({
        id: coder2,
        name: 'Coder 2',
        description: 'Test',
        system_prompt: 'Test',
        is_enabled: true,
        config: { type: 'coder' },
      })

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        allowed_invokers: [{ type: 'agent', agent_type: 'coder' }],
      })

      const event1 = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: coder1,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(event1), 'First coder agent should match').toHaveLength(1)

      const event2 = eventsRepository.create({
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
        ticket_id: testTicketId,
        actor_id: coder2,
        actor_type: 'agent',
        payload: {},
      })
      expect(agentService.findMatchingTriggers(event2), 'Second coder agent should match').toHaveLength(1)
    })
  })

  describe('checkPermission scope resolution', () => {
    function createInvocation(context: Record<string, unknown>) {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.updated',
      })
      return agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: trigger.id,
        project_id:
          typeof context.project_id === 'string' && context.project_id.trim().length > 0
            ? context.project_id
            : undefined,
        context,
      })
    }

    it('fails closed for project scope when project context is missing', () => {
      agentsRepository.update(agentId, {
        permissions: [{ type: 'resource', resource: 'ticket', actions: ['update'], scope: 'project' }],
      })
      const invocation = createInvocation({})
      const agent = agentService.getAgent(agentId)!

      const result = agentService.checkPermission(
        agent,
        {
          type: 'resource',
          resource: 'ticket',
          action: 'update',
          resourceId: testTicketId,
          projectId: TEST_PROJECT_ID,
        },
        { invocation }
      )

      expect(result.allowed).toBe(false)
    })

    it('uses invocation context project_id when event context is absent', () => {
      agentsRepository.update(agentId, {
        permissions: [{ type: 'resource', resource: 'ticket', actions: ['update'], scope: 'project' }],
      })
      const invocation = createInvocation({ project_id: TEST_PROJECT_ID, ticket_id: testTicketId })
      const agent = agentService.getAgent(agentId)!

      const result = agentService.checkPermission(
        agent,
        {
          type: 'resource',
          resource: 'ticket',
          action: 'update',
          resourceId: testTicketId,
          projectId: TEST_PROJECT_ID,
        },
        { invocation }
      )

      expect(result.allowed).toBe(true)
    })

    it('uses invocation context ticket_id for invocation scope checks', () => {
      agentsRepository.update(agentId, {
        permissions: [{ type: 'resource', resource: 'ticket', actions: ['update'], scope: 'invocation' }],
      })
      const invocation = createInvocation({ project_id: TEST_PROJECT_ID, ticket_id: testTicketId })
      const agent = agentService.getAgent(agentId)!

      const allowed = agentService.checkPermission(
        agent,
        {
          type: 'resource',
          resource: 'ticket',
          action: 'update',
          resourceId: testTicketId,
        },
        { invocation }
      )
      const denied = agentService.checkPermission(
        agent,
        {
          type: 'resource',
          resource: 'ticket',
          action: 'update',
          resourceId: testTicketId + 999,
        },
        { invocation }
      )

      expect(allowed.allowed).toBe(true)
      expect(denied.allowed).toBe(false)
    })
  })

  describe('createAgent', () => {
    it('should auto-generate UUID when id is not provided', () => {
      const agent = agentService.createAgent({
        name: 'New Agent',
        description: 'A new agent',
        system_prompt: 'You are helpful.',
      })

      expect(agent.id, 'Should have a UUID id').toMatch(UUID_REGEX)
    })

    it('should derive slug from name', () => {
      const agent = agentService.createAgent({
        name: 'My Cool Agent',
        description: 'Does cool things',
        system_prompt: 'You are cool.',
      })

      expect(agent.slug, 'Slug should be derived from name').toBe('my-cool-agent')
    })

    it('should use explicit valid UUID id when provided', () => {
      const explicitId = '11111111-1111-1111-1111-111111111111'
      const agent = agentService.createAgent({
        id: explicitId,
        name: 'Explicit ID Agent',
        description: 'Has explicit ID',
        system_prompt: 'Test.',
      })

      expect(agent.id).toBe(explicitId)
    })

    it('should reject non-UUID id', () => {
      expect(() =>
        agentService.createAgent({
          id: 'not-a-uuid',
          name: 'Bad ID Agent',
          description: 'Should fail',
          system_prompt: 'Test.',
        })
      ).toThrow('Agent ID must be a valid UUID')
    })

    it('should throw on duplicate slug', () => {
      agentService.createAgent({
        name: 'Duplicate Name',
        description: 'First agent',
        system_prompt: 'First.',
      })

      expect(() =>
        agentService.createAgent({
          name: 'Duplicate Name',
          description: 'Second agent',
          system_prompt: 'Second.',
        })
      ).toThrow("Agent with slug 'duplicate-name' already exists")
    })

    it('should auto-create profile if missing', () => {
      const agent = agentService.createAgent({
        name: 'Profile Auto Agent',
        description: 'Auto-created profile',
        system_prompt: 'Test.',
      })

      const profile = profilesRepository.get(agent.id)
      expect(profile, 'Profile should be auto-created').not.toBeNull()
      expect(profile?.name).toBe('Profile Auto Agent')
      expect(profile?.type).toBe('agent')
    })
  })
})
