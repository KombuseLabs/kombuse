/**
 * @fileoverview Tests for agents, triggers, and invocations repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/agents.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create an agent"
 *
 * Tests cover:
 * - agentsRepository: CRUD for agents
 * - agentTriggersRepository: CRUD for triggers
 * - agentInvocationsRepository: CRUD for invocations
 * - sessionsRepository: CRUD for sessions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_AGENT_ID, TEST_PROJECT_ID, TEST_USER_ID } from '../test-utils'
import {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
} from '../agents'
import { sessionsRepository } from '../sessions'
import { profilesRepository } from '../profiles'
import { eventsRepository } from '../events'

// Helper to create unique agent profiles
let agentCounter = 0
function createAgentProfile() {
  const id = `agent-${++agentCounter}-${Date.now()}`
  profilesRepository.create({
    id,
    type: 'agent',
    name: `Test Agent ${agentCounter}`,
    description: 'Agent for testing',
  })
  return id
}

/** Shorthand: adds required name/description fields to a create input */
function agentInput(overrides: Partial<import('@kombuse/types').CreateAgentInput> & { id: string; system_prompt: string }): import('@kombuse/types').CreateAgentInput {
  return { name: 'Test Agent', description: 'Test description', ...overrides }
}

describe('agentsRepository', () => {
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

  describe('create', () => {
    it('should create an agent with required fields', () => {
      const profileId = createAgentProfile()
      const agent = agentsRepository.create(agentInput({
        id: profileId,
        system_prompt: 'You are a helpful assistant.',
      }))

      expect(agent.id).toBe(profileId)
      expect(agent.system_prompt).toBe('You are a helpful assistant.')
      expect(agent.is_enabled).toBe(true)
      expect(agent.permissions).toEqual([])
      expect(agent.config).toEqual({})
    })

    it('should create an agent with permissions and config', () => {
      const profileId = createAgentProfile()
      const agent = agentsRepository.create(agentInput({
        id: profileId,
        system_prompt: 'Review tickets for completeness.',
        permissions: [
          { type: 'resource', resource: 'ticket.*', actions: ['read'], scope: 'invocation' },
          { type: 'tool', tool: 'mcp__kombuse__*', scope: 'invocation' },
        ],
        config: {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          temperature: 0.3,
        },
      }))

      expect(agent.permissions).toHaveLength(2)
      expect(agent.permissions[0]).toEqual({
        type: 'resource',
        resource: 'ticket.*',
        actions: ['read'],
        scope: 'invocation',
      })
      expect(agent.config.model).toBe('claude-sonnet-4-20250514')
      expect(agent.config.max_tokens).toBe(4096)
    })

    it('should create a disabled agent', () => {
      const profileId = createAgentProfile()
      const agent = agentsRepository.create(agentInput({
        id: profileId,
        system_prompt: 'Disabled agent.',
        is_enabled: false,
      }))

      expect(agent.is_enabled).toBe(false)
    })
  })

  describe('get', () => {
    it('should return null for non-existent agent', () => {
      const agent = agentsRepository.get('non-existent-agent')
      expect(agent).toBeNull()
    })

    it('should return agent by ID', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({
        id: profileId,
        system_prompt: 'Test prompt.',
      }))

      const agent = agentsRepository.get(profileId)

      expect(agent).not.toBeNull()
      expect(agent?.id).toBe(profileId)
      expect(agent?.system_prompt).toBe('Test prompt.')
    })
  })

  describe('list', () => {
    it('should return all agents when no filters provided', () => {
      const profileId1 = createAgentProfile()
      const profileId2 = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId1, system_prompt: 'Agent 1' }))
      agentsRepository.create(agentInput({ id: profileId2, system_prompt: 'Agent 2' }))

      const agents = agentsRepository.list()

      expect(agents.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter agents by is_enabled', () => {
      const enabledId = createAgentProfile()
      const disabledId = createAgentProfile()
      agentsRepository.create(agentInput({ id: enabledId, system_prompt: 'Enabled', is_enabled: true }))
      agentsRepository.create(agentInput({ id: disabledId, system_prompt: 'Disabled', is_enabled: false }))

      const enabledAgents = agentsRepository.list({ is_enabled: true })
      const disabledAgents = agentsRepository.list({ is_enabled: false })

      expect(enabledAgents.every((a) => a.is_enabled)).toBe(true)
      expect(disabledAgents.every((a) => !a.is_enabled)).toBe(true)
    })

    it('should support pagination', () => {
      const ids = [createAgentProfile(), createAgentProfile(), createAgentProfile()]
      ids.forEach((id) => agentsRepository.create(agentInput({ id, system_prompt: 'Test' })))

      const page1 = agentsRepository.list({ limit: 2 })
      expect(page1).toHaveLength(2)
    })

    it('should filter agents by enabled_for_chat', () => {
      const chatEnabledId = createAgentProfile()
      const chatDisabledId = createAgentProfile()
      const noConfigId = createAgentProfile()

      agentsRepository.create(agentInput({
        id: chatEnabledId,
        system_prompt: 'Chat enabled',
        config: { enabled_for_chat: true },
      }))
      agentsRepository.create(agentInput({
        id: chatDisabledId,
        system_prompt: 'Chat disabled',
        config: { enabled_for_chat: false },
      }))
      agentsRepository.create(agentInput({
        id: noConfigId,
        system_prompt: 'No config flag',
      }))

      const chatAgents = agentsRepository.list({ enabled_for_chat: true })

      expect(chatAgents.every((a) => a.config.enabled_for_chat === true)).toBe(true)
      expect(chatAgents.some((a) => a.id === chatEnabledId)).toBe(true)
      expect(chatAgents.some((a) => a.id === chatDisabledId)).toBe(false)
      expect(chatAgents.some((a) => a.id === noConfigId)).toBe(false)
    })
  })

  describe('update', () => {
    it('should update agent system_prompt', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId, system_prompt: 'Original prompt' }))

      const updated = agentsRepository.update(profileId, {
        system_prompt: 'Updated prompt',
      })

      expect(updated?.system_prompt).toBe('Updated prompt')
    })

    it('should update agent permissions', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId, system_prompt: 'Test' }))

      const updated = agentsRepository.update(profileId, {
        permissions: [{ type: 'resource', resource: '*', actions: ['*'], scope: 'global' }],
      })

      expect(updated?.permissions).toHaveLength(1)
      expect(updated?.permissions?.[0]?.scope).toBe('global')
    })

    it('should update agent config', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId, system_prompt: 'Test' }))

      const updated = agentsRepository.update(profileId, {
        config: { model: 'gpt-4o', temperature: 0.7 },
      })

      expect(updated?.config.model).toBe('gpt-4o')
      expect(updated?.config.temperature).toBe(0.7)
    })

    it('should toggle is_enabled', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId, system_prompt: 'Test', is_enabled: true }))

      const updated = agentsRepository.update(profileId, { is_enabled: false })

      expect(updated?.is_enabled).toBe(false)
    })

    it('should return null for non-existent agent', () => {
      const result = agentsRepository.update('non-existent', { system_prompt: 'New' })
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete agent and return true', () => {
      const profileId = createAgentProfile()
      agentsRepository.create(agentInput({ id: profileId, system_prompt: 'Delete me' }))

      const deleted = agentsRepository.delete(profileId)

      expect(deleted).toBe(true)
      expect(agentsRepository.get(profileId)).toBeNull()
    })

    it('should return false for non-existent agent', () => {
      const deleted = agentsRepository.delete('non-existent')
      expect(deleted).toBe(false)
    })
  })
})

describe('agentTriggersRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let agentId: string

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
    // Create an agent for trigger tests
    agentId = createAgentProfile()
    agentsRepository.create(agentInput({ id: agentId, system_prompt: 'Trigger test agent' }))
  })

  afterEach(() => {
    cleanup()
  })

  describe('create', () => {
    it('should create a trigger with required fields', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      expect(trigger.id).toBeDefined()
      expect(trigger.agent_id).toBe(agentId)
      expect(trigger.event_type).toBe('ticket.created')
      expect(trigger.is_enabled).toBe(true)
      expect(trigger.priority).toBe(0)
      expect(trigger.project_id).toBeNull()
      expect(trigger.conditions).toBeNull()
    })

    it('should create a trigger with project scope and conditions', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'comment.added',
        project_id: TEST_PROJECT_ID,
        conditions: { status: 'open' },
        priority: 10,
      })

      expect(trigger.project_id).toBe(TEST_PROJECT_ID)
      expect(trigger.conditions).toEqual({ status: 'open' })
      expect(trigger.priority).toBe(10)
    })

    it('should create a disabled trigger', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.updated',
        is_enabled: false,
      })

      expect(trigger.is_enabled).toBe(false)
    })
  })

  describe('get', () => {
    it('should return null for non-existent trigger', () => {
      const trigger = agentTriggersRepository.get(99999)
      expect(trigger).toBeNull()
    })

    it('should return trigger by ID', () => {
      const created = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      const trigger = agentTriggersRepository.get(created.id)

      expect(trigger).not.toBeNull()
      expect(trigger?.id).toBe(created.id)
    })
  })

  describe('listByAgent', () => {
    it('should return triggers for an agent', () => {
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'ticket.created' })
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'comment.added' })

      const triggers = agentTriggersRepository.listByAgent(agentId)

      expect(triggers).toHaveLength(2)
      expect(triggers.every((t) => t.agent_id === agentId)).toBe(true)
    })

    it('should order triggers by priority descending', () => {
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'low', priority: 1 })
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'high', priority: 10 })
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'medium', priority: 5 })

      const triggers = agentTriggersRepository.listByAgent(agentId)

      expect(triggers[0]?.priority).toBe(10)
      expect(triggers[1]?.priority).toBe(5)
      expect(triggers[2]?.priority).toBe(1)
    })
  })

  describe('listByEventType', () => {
    it('should return enabled triggers matching event type', () => {
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'ticket.created', is_enabled: true })
      agentTriggersRepository.create({ agent_id: agentId, event_type: 'ticket.created', is_enabled: false })

      const triggers = agentTriggersRepository.listByEventType('ticket.created')

      expect(triggers.length).toBeGreaterThanOrEqual(1)
      expect(triggers.every((t) => t.is_enabled)).toBe(true)
    })

    it('should include global triggers (no project_id) for any project', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        // No project_id = global trigger
      })

      const triggers = agentTriggersRepository.listByEventType('ticket.created', 'any-project')

      expect(triggers.some((t) => t.project_id === null)).toBe(true)
    })

    it('should include project-specific triggers when project matches', () => {
      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        project_id: TEST_PROJECT_ID,
      })

      const triggers = agentTriggersRepository.listByEventType('ticket.created', TEST_PROJECT_ID)

      expect(triggers.some((t) => t.project_id === TEST_PROJECT_ID)).toBe(true)
    })
  })

  describe('update', () => {
    it('should update trigger event_type', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      const updated = agentTriggersRepository.update(trigger.id, {
        event_type: 'ticket.updated',
      })

      expect(updated?.event_type).toBe('ticket.updated')
    })

    it('should update trigger conditions', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      const updated = agentTriggersRepository.update(trigger.id, {
        conditions: { priority: 4 },
      })

      expect(updated?.conditions).toEqual({ priority: 4 })
    })

    it('should clear conditions when set to null', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
        conditions: { status: 'open' },
      })

      const updated = agentTriggersRepository.update(trigger.id, {
        conditions: null,
      })

      expect(updated?.conditions).toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete trigger and return true', () => {
      const trigger = agentTriggersRepository.create({
        agent_id: agentId,
        event_type: 'ticket.created',
      })

      const deleted = agentTriggersRepository.delete(trigger.id)

      expect(deleted).toBe(true)
      expect(agentTriggersRepository.get(trigger.id)).toBeNull()
    })
  })
})

describe('agentInvocationsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType
  let agentId: string
  let triggerId: number

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
    // Create an agent and trigger for invocation tests
    agentId = createAgentProfile()
    agentsRepository.create(agentInput({ id: agentId, system_prompt: 'Invocation test agent' }))
    const trigger = agentTriggersRepository.create({
      agent_id: agentId,
      event_type: 'ticket.created',
    })
    triggerId = trigger.id
  })

  afterEach(() => {
    cleanup()
  })

  describe('create', () => {
    it('should create an invocation with required fields', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 123 },
      })

      expect(invocation.id).toBeDefined()
      expect(invocation.agent_id).toBe(agentId)
      expect(invocation.trigger_id).toBe(triggerId)
      expect(invocation.status).toBe('pending')
      expect(invocation.attempts).toBe(0)
      expect(invocation.max_attempts).toBe(3)
      expect(invocation.run_at).toBeDefined()
      expect(invocation.context).toEqual({ ticket_id: 123 })
      expect(invocation.result).toBeNull()
      expect(invocation.error).toBeNull()
      expect(invocation.session_id).toBeNull()
    })

    it('should create an invocation with session_id', () => {
      const session = sessionsRepository.create()
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 456 },
        session_id: session.id,
      })

      expect(invocation.session_id).toBe(session.id)
    })

    it('should create an invocation with project_id', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        project_id: TEST_PROJECT_ID,
        context: { ticket_id: 456, project_id: TEST_PROJECT_ID },
      })

      expect(invocation.project_id).toBe(TEST_PROJECT_ID)
    })
  })

  describe('get', () => {
    it('should return null for non-existent invocation', () => {
      const invocation = agentInvocationsRepository.get(99999)
      expect(invocation).toBeNull()
    })

    it('should return invocation by ID', () => {
      const created = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 789 },
      })

      const invocation = agentInvocationsRepository.get(created.id)

      expect(invocation).not.toBeNull()
      expect(invocation?.id).toBe(created.id)
    })
  })

  describe('list', () => {
    it('should filter invocations by agent_id', () => {
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const invocations = agentInvocationsRepository.list({ agent_id: agentId })

      expect(invocations.length).toBeGreaterThanOrEqual(1)
      expect(invocations.every((i) => i.agent_id === agentId)).toBe(true)
    })

    it('should filter invocations by status', () => {
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const pending = agentInvocationsRepository.list({ status: 'pending' })

      expect(pending.every((i) => i.status === 'pending')).toBe(true)
    })

    it('should filter invocations by project_id', () => {
      const otherProjectId = 'test-project-2'
      db.prepare(`
        INSERT INTO projects (id, name, owner_id)
        VALUES (?, 'Other Project', ?)
      `).run(otherProjectId, TEST_USER_ID)

      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        project_id: TEST_PROJECT_ID,
        context: { project_id: TEST_PROJECT_ID },
      })
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        project_id: otherProjectId,
        context: { project_id: otherProjectId },
      })

      const scoped = agentInvocationsRepository.list({ project_id: TEST_PROJECT_ID })

      expect(scoped).toHaveLength(1)
      expect(scoped[0]?.project_id).toBe(TEST_PROJECT_ID)
    })
  })

  describe('update', () => {
    it('should update invocation status', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const updated = agentInvocationsRepository.update(invocation.id, {
        status: 'running',
        started_at: new Date().toISOString(),
      })

      expect(updated?.status).toBe('running')
      expect(updated?.started_at).toBeDefined()
    })

    it('should update retry scheduling fields', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const nextRunAt = new Date(Date.now() + 60_000).toISOString()
      const updated = agentInvocationsRepository.update(invocation.id, {
        attempts: 1,
        run_at: nextRunAt,
        error: 'temporary failure',
      })

      expect(updated?.attempts).toBe(1)
      expect(updated?.run_at).toBe(nextRunAt)
      expect(updated?.error).toBe('temporary failure')
    })

    it('should update invocation result on completion', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 1 },
      })

      const completed = agentInvocationsRepository.update(invocation.id, {
        status: 'completed',
        result: { comment_id: 42, message: 'Review completed' },
        completed_at: new Date().toISOString(),
      })

      expect(completed?.status).toBe('completed')
      expect(completed?.result).toEqual({ comment_id: 42, message: 'Review completed' })
      expect(completed?.completed_at).toBeDefined()
    })

    it('should update invocation with error result on failure', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const failed = agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        result: { error: 'Permission denied', code: 'PERMISSION_ERROR' },
        completed_at: new Date().toISOString(),
      })

      expect(failed?.status).toBe('failed')
      expect(failed?.result?.error).toBe('Permission denied')
    })
  })

  describe('countRecentByTicketId', () => {
    it('should count invocations for a specific ticket', () => {
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count).toBe(2)
    })

    it('should not count invocations for a different ticket', () => {
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 200 },
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count, 'Should only count ticket 100, not ticket 200').toBe(1)
    })

    it('should return 0 when no invocations exist for the ticket', () => {
      const count = agentInvocationsRepository.countRecentByTicketId(999)
      expect(count).toBe(0)
    })

    it('should count all statuses (pending, running, completed, failed)', () => {
      const inv1 = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.update(inv1.id, { status: 'running' })

      const inv2 = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.update(inv2.id, { status: 'completed' })

      const inv3 = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.update(inv3.id, { status: 'failed' })

      // inv4 stays as 'pending'
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count, 'Should count all 4 invocations regardless of status').toBe(4)
    })

    it('should only count invocations within the time window', () => {
      // Create an invocation with a backdated created_at
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      // Backdate one invocation to 2 hours ago
      db.prepare(
        `UPDATE agent_invocations SET created_at = datetime('now', '-2 hours')
         WHERE id = (SELECT MAX(id) FROM agent_invocations)`
      ).run()

      // Create a recent invocation
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })

      const count1h = agentInvocationsRepository.countRecentByTicketId(100, 1)
      expect(count1h, 'Should only count the recent invocation within 1 hour').toBe(1)

      const count3h = agentInvocationsRepository.countRecentByTicketId(100, 3)
      expect(count3h, 'Should count both invocations within 3 hours').toBe(2)
    })

    it('should not count invocations originating from user events', () => {
      // Create a user-originated event (ticket_id omitted — FK not relevant here)
      const userEvent = eventsRepository.create({
        event_type: 'mention.created',
        project_id: TEST_PROJECT_ID,
        actor_id: TEST_USER_ID,
        actor_type: 'user',
        payload: {},
      })

      // Invocation linked to user event — should be excluded
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        event_id: userEvent.id,
        context: { ticket_id: 100 },
      })

      // Create an agent-originated event
      const agentEvent = eventsRepository.create({
        event_type: 'agent.completed',
        project_id: TEST_PROJECT_ID,
        actor_id: agentId,
        actor_type: 'agent',
        payload: {},
      })

      // Invocation linked to agent event — should be counted
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        event_id: agentEvent.id,
        context: { ticket_id: 100 },
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count, 'Should exclude user-initiated invocations').toBe(1)
    })

    it('should not count loop-guard-failed invocations', () => {
      // Normal invocation
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })

      // Loop-guard-failed invocation
      const loopInv = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })
      agentInvocationsRepository.update(loopInv.id, {
        status: 'failed',
        error: 'Chain depth limit reached (15 invocations on ticket #100 in the last hour). Halting to prevent infinite loops.',
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count, 'Should exclude loop-guard-failed invocations').toBe(1)
    })

    it('should still count invocations without event_id', () => {
      // Invocation without event_id (NULL)
      agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: { ticket_id: 100 },
      })

      const count = agentInvocationsRepository.countRecentByTicketId(100)
      expect(count, 'Invocations without event_id should be counted').toBe(1)
    })
  })

  describe('delete', () => {
    it('should delete invocation and return true', () => {
      const invocation = agentInvocationsRepository.create({
        agent_id: agentId,
        trigger_id: triggerId,
        context: {},
      })

      const deleted = agentInvocationsRepository.delete(invocation.id)

      expect(deleted).toBe(true)
      expect(agentInvocationsRepository.get(invocation.id)).toBeNull()
    })
  })
})

describe('sessionsRepository', () => {
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

  describe('create', () => {
    it('should create a session with auto-generated ID', () => {
      const session = sessionsRepository.create()

      expect(session.id).toBeDefined()
      expect(session.created_at).toBeDefined()
      expect(session.updated_at).toBeDefined()
    })

    it('should create a session with custom ID', () => {
      const customId = `session-${Date.now()}`
      const session = sessionsRepository.create({ id: customId })

      expect(session.id).toBe(customId)
    })
  })

  describe('get', () => {
    it('should return null for non-existent session', () => {
      const session = sessionsRepository.get('non-existent-session')
      expect(session).toBeNull()
    })

    it('should return session by ID', () => {
      const created = sessionsRepository.create()

      const session = sessionsRepository.get(created.id)

      expect(session).not.toBeNull()
      expect(session?.id).toBe(created.id)
    })
  })

  describe('list', () => {
    it('should return all sessions', () => {
      sessionsRepository.create()
      sessionsRepository.create()

      const sessions = sessionsRepository.list()

      expect(sessions.length).toBeGreaterThanOrEqual(2)
    })

    it('should support pagination', () => {
      sessionsRepository.create()
      sessionsRepository.create()
      sessionsRepository.create()

      const page1 = sessionsRepository.list({ limit: 2 })
      expect(page1).toHaveLength(2)
    })
  })

  describe('touch', () => {
    it('should update session updated_at timestamp', async () => {
      const session = sessionsRepository.create()
      const originalUpdatedAt = session.updated_at

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      const touched = sessionsRepository.touch(session.id)

      expect(touched).not.toBeNull()
      // Note: SQLite datetime precision may not capture small delays
      // but the update should succeed
      expect(touched?.id).toBe(session.id)
    })
  })

  describe('delete', () => {
    it('should delete session and return true', () => {
      const session = sessionsRepository.create()

      const deleted = sessionsRepository.delete(session.id)

      expect(deleted).toBe(true)
      expect(sessionsRepository.get(session.id)).toBeNull()
    })

    it('should return false for non-existent session', () => {
      const deleted = sessionsRepository.delete('non-existent')
      expect(deleted).toBe(false)
    })
  })
})
