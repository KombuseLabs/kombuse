import type {
  Agent,
  AgentTrigger,
  AgentInvocation,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
  ResourcePermission,
  ToolPermission,
  Event,
  PermissionContext,
  PermissionCheckRequest,
  PermissionCheckResult,
} from '@kombuse/types'
import {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
  profilesRepository,
} from '@kombuse/persistence'

/**
 * Result of finding matching triggers
 */
export interface TriggerMatchResult {
  trigger: AgentTrigger
  agent: Agent
}

/**
 * Service interface for agent operations
 */
export interface IAgentService {
  // Agent CRUD
  listAgents(filters?: { is_enabled?: boolean }): Agent[]
  getAgent(id: string): Agent | null
  createAgent(input: CreateAgentInput): Agent
  updateAgent(id: string, input: UpdateAgentInput): Agent
  deleteAgent(id: string): void

  // Trigger CRUD
  listTriggers(agentId: string): AgentTrigger[]
  listTriggersByLabelId(labelId: number): AgentTrigger[]
  getTrigger(id: number): AgentTrigger | null
  createTrigger(input: CreateAgentTriggerInput): AgentTrigger
  updateTrigger(id: number, input: UpdateAgentTriggerInput): AgentTrigger
  deleteTrigger(id: number): void

  // Invocation management
  listInvocations(filters?: { agent_id?: string; status?: string }): AgentInvocation[]
  getInvocation(id: number): AgentInvocation | null

  // Core operations
  findMatchingTriggers(event: Event): TriggerMatchResult[]
  checkPermission(
    agent: Agent,
    request: PermissionCheckRequest,
    context: PermissionContext
  ): PermissionCheckResult
  invokeAgent(trigger: AgentTrigger, event: Event): AgentInvocation
}

/**
 * Check if a string matches a glob pattern
 * Supports: * (any chars), ? (single char)
 */
function matchGlob(pattern: string, value: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*') // * matches any chars
    .replace(/\?/g, '.') // ? matches single char

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(value)
}

/**
 * Check if conditions match an event payload
 */
function matchConditions(
  conditions: Record<string, unknown> | null,
  eventPayload: Record<string, unknown>
): boolean {
  if (!conditions) return true

  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = eventPayload[key]
    if (actualValue !== expectedValue) {
      return false
    }
  }

  return true
}

/**
 * Agent service implementation
 */
export class AgentService implements IAgentService {
  // ============================================
  // Agent CRUD
  // ============================================

  listAgents(filters?: { is_enabled?: boolean }): Agent[] {
    return agentsRepository.list(filters)
  }

  getAgent(id: string): Agent | null {
    return agentsRepository.get(id)
  }

  createAgent(input: CreateAgentInput): Agent {
    let profile = profilesRepository.get(input.id)
    if (!profile) {
      // Auto-create agent profile
      profile = profilesRepository.create({
        id: input.id,
        type: 'agent',
        name: input.name || input.id,
      })
    }
    if (profile.type !== 'agent') {
      throw new Error(`Profile ${input.id} is not of type 'agent'`)
    }

    return agentsRepository.create(input)
  }

  updateAgent(id: string, input: UpdateAgentInput): Agent {
    const existing = agentsRepository.get(id)
    if (!existing) {
      throw new Error(`Agent ${id} not found`)
    }

    const updated = agentsRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update agent ${id}`)
    }

    return updated
  }

  deleteAgent(id: string): void {
    const success = agentsRepository.delete(id)
    if (!success) {
      throw new Error(`Agent ${id} not found`)
    }
  }

  // ============================================
  // Trigger CRUD
  // ============================================

  listTriggers(agentId: string): AgentTrigger[] {
    return agentTriggersRepository.listByAgent(agentId)
  }

  listTriggersByLabelId(labelId: number): AgentTrigger[] {
    return agentTriggersRepository.listByLabelId(labelId)
  }

  getTrigger(id: number): AgentTrigger | null {
    return agentTriggersRepository.get(id)
  }

  createTrigger(input: CreateAgentTriggerInput): AgentTrigger {
    // Verify agent exists
    const agent = agentsRepository.get(input.agent_id)
    if (!agent) {
      throw new Error(`Agent ${input.agent_id} not found`)
    }

    // mention.created triggers require explicit conditions (e.g. mention_type)
    if (input.event_type === 'mention.created' && !input.conditions) {
      throw new Error(
        'mention.created triggers require explicit conditions (e.g. { mention_type: "profile" })'
      )
    }

    return agentTriggersRepository.create(input)
  }

  updateTrigger(id: number, input: UpdateAgentTriggerInput): AgentTrigger {
    const existing = agentTriggersRepository.get(id)
    if (!existing) {
      throw new Error(`Trigger ${id} not found`)
    }

    // mention.created triggers require explicit conditions
    const effectiveEventType = input.event_type ?? existing.event_type
    const effectiveConditions =
      input.conditions !== undefined ? input.conditions : existing.conditions
    if (effectiveEventType === 'mention.created' && !effectiveConditions) {
      throw new Error(
        'mention.created triggers require explicit conditions (e.g. { mention_type: "profile" })'
      )
    }

    const updated = agentTriggersRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update trigger ${id}`)
    }

    return updated
  }

  deleteTrigger(id: number): void {
    const success = agentTriggersRepository.delete(id)
    if (!success) {
      throw new Error(`Trigger ${id} not found`)
    }
  }

  // ============================================
  // Invocation management
  // ============================================

  listInvocations(filters?: {
    agent_id?: string
    status?: string
  }): AgentInvocation[] {
    return agentInvocationsRepository.list(filters as any)
  }

  getInvocation(id: number): AgentInvocation | null {
    return agentInvocationsRepository.get(id)
  }

  // ============================================
  // Core operations
  // ============================================

  /**
   * Find all triggers that match a given event
   */
  findMatchingTriggers(event: Event): TriggerMatchResult[] {
    const results: TriggerMatchResult[] = []

    const triggers = agentTriggersRepository.listByEventType(
      event.event_type,
      event.project_id ?? undefined
    )

    for (const trigger of triggers) {
      // mention.created triggers without conditions are skipped —
      // they must specify mention_type to avoid matching all mention kinds
      if (event.event_type === 'mention.created' && !trigger.conditions) {
        continue
      }

      const eventPayload =
        typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload

      if (!matchConditions(trigger.conditions, eventPayload)) {
        continue
      }

      const agent = agentsRepository.get(trigger.agent_id)
      if (!agent || !agent.is_enabled) {
        continue
      }

      results.push({ trigger, agent })
    }

    return results
  }

  /**
   * Check if an agent has permission to perform an action
   */
  checkPermission(
    agent: Agent,
    request: PermissionCheckRequest,
    context: PermissionContext
  ): PermissionCheckResult {
    const { permissions } = agent

    for (const permission of permissions) {
      // Type mismatch
      if (permission.type !== request.type) {
        continue
      }

      if (permission.type === 'resource' && request.type === 'resource') {
        const result = this.checkResourcePermission(
          permission,
          request,
          context
        )
        if (result.allowed) {
          return result
        }
      }

      if (permission.type === 'tool' && request.type === 'tool') {
        const result = this.checkToolPermission(permission, request, context)
        if (result.allowed) {
          return result
        }
      }
    }

    return {
      allowed: false,
      reason: `No matching permission found for ${request.type}: ${request.resource || request.tool}`,
    }
  }

  private checkResourcePermission(
    permission: ResourcePermission,
    request: PermissionCheckRequest,
    context: PermissionContext
  ): PermissionCheckResult {
    // Check resource pattern matches
    if (!matchGlob(permission.resource, request.resource || '')) {
      return { allowed: false, reason: 'Resource pattern does not match' }
    }

    // Check action is allowed
    const actions = permission.actions
    if (
      !actions.includes('*') &&
      request.action &&
      !actions.includes(request.action)
    ) {
      return { allowed: false, reason: `Action '${request.action}' not allowed` }
    }

    // Check scope
    if (!this.checkScope(permission.scope, request, context)) {
      return { allowed: false, reason: `Scope '${permission.scope}' not satisfied` }
    }

    return { allowed: true, matchedPermission: permission }
  }

  private checkToolPermission(
    permission: ToolPermission,
    request: PermissionCheckRequest,
    context: PermissionContext
  ): PermissionCheckResult {
    // Check tool pattern matches
    if (!matchGlob(permission.tool, request.tool || '')) {
      return { allowed: false, reason: 'Tool pattern does not match' }
    }

    // Check scope
    if (!this.checkScope(permission.scope, request, context)) {
      return { allowed: false, reason: `Scope '${permission.scope}' not satisfied` }
    }

    return { allowed: true, matchedPermission: permission }
  }

  private checkScope(
    scope: 'invocation' | 'project' | 'global',
    request: PermissionCheckRequest,
    context: PermissionContext
  ): boolean {
    switch (scope) {
      case 'global':
        // Always allowed
        return true

      case 'project':
        // Check resource is in the same project as the triggering event
        if (context.event?.project_id && request.projectId) {
          return context.event.project_id === request.projectId
        }
        // If no project context, allow (conservative)
        return true

      case 'invocation':
        // Check resource is related to the triggering event
        // For now, we check if the resource ID matches the event's ticket/comment
        if (request.resource === 'ticket' && context.event?.ticket_id) {
          return String(request.resourceId) === String(context.event.ticket_id)
        }
        if (request.resource === 'comment' && context.event?.comment_id) {
          return String(request.resourceId) === String(context.event.comment_id)
        }
        // For create operations on comments, check the ticket context
        if (
          request.resource === 'comment' &&
          request.action === 'create' &&
          context.event?.ticket_id
        ) {
          // Allow creating comments on the triggering ticket
          return true
        }
        // Default: allow within invocation context
        return true

      default:
        return false
    }
  }

  /**
   * Create an invocation for a trigger/event pair.
   * The session is created later by the chat infrastructure when execution starts.
   */
  invokeAgent(trigger: AgentTrigger, event: Event): AgentInvocation {
    const context: Record<string, unknown> = {
      event_id: event.id,
      event_type: event.event_type,
      project_id: event.project_id,
      ticket_id: event.ticket_id,
      comment_id: event.comment_id,
    }

    const agent = agentsRepository.get(trigger.agent_id)
    const maxAttempts =
      typeof agent?.config.max_retries === 'number'
        ? Math.max(1, Math.floor(agent.config.max_retries) + 1)
        : 3

    return agentInvocationsRepository.create({
      agent_id: trigger.agent_id,
      trigger_id: trigger.id,
      event_id: event.id,
      max_attempts: maxAttempts,
      context,
    })
  }

  /**
   * Process an event - find matching triggers and create invocations
   */
  processEvent(event: Event): AgentInvocation[] {
    const matches = this.findMatchingTriggers(event)
    return matches.map(({ trigger }) => this.invokeAgent(trigger, event))
  }
}

// Singleton instance for convenience
export const agentService = new AgentService()
