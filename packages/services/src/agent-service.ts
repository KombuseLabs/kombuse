import type {
  Agent,
  AgentTrigger,
  AgentInvocation,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
  CreateAgentInvocationInput,
  UpdateAgentInvocationInput,
  Permission,
  ResourcePermission,
  ToolPermission,
  Event,
  AgentConfig,
} from '@kombuse/types'
import {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
  sessionsRepository,
  profilesRepository,
} from '@kombuse/persistence'

/**
 * Context for permission checking - describes what resource is being accessed
 */
export interface PermissionContext {
  /** The invocation that triggered this check */
  invocation: AgentInvocation
  /** The event that triggered the invocation */
  event?: Event
}

/**
 * Request to check a permission
 */
export interface PermissionCheckRequest {
  /** Type of check: 'resource' or 'tool' */
  type: 'resource' | 'tool'
  /** For resource: the resource type (e.g., 'ticket', 'comment') */
  resource?: string
  /** For resource: the action being performed */
  action?: 'read' | 'create' | 'update' | 'delete'
  /** For resource: the specific resource ID being accessed */
  resourceId?: string | number
  /** For resource: the project the resource belongs to */
  projectId?: string
  /** For tool: the tool name being invoked */
  tool?: string
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  matchedPermission?: Permission
}

/**
 * Result of finding matching triggers
 */
export interface TriggerMatchResult {
  trigger: AgentTrigger
  agent: Agent
}

/**
 * Result of running an agent
 */
export interface AgentRunResult {
  success: boolean
  invocation: AgentInvocation
  error?: string
}

/**
 * Callback for running an agent - implement this to integrate with LLM
 */
export type AgentRunner = (params: {
  agent: Agent
  invocation: AgentInvocation
  event: Event
  checkPermission: (request: PermissionCheckRequest) => PermissionCheckResult
}) => Promise<{ result: Record<string, unknown>; error?: string }>

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
  runAgent(invocationId: number, runner: AgentRunner): Promise<AgentRunResult>
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
    // Verify profile exists and is of type 'agent'
    const profile = profilesRepository.get(input.id)
    if (!profile) {
      throw new Error(`Profile ${input.id} not found. Create a profile first.`)
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

  getTrigger(id: number): AgentTrigger | null {
    return agentTriggersRepository.get(id)
  }

  createTrigger(input: CreateAgentTriggerInput): AgentTrigger {
    // Verify agent exists
    const agent = agentsRepository.get(input.agent_id)
    if (!agent) {
      throw new Error(`Agent ${input.agent_id} not found`)
    }

    return agentTriggersRepository.create(input)
  }

  updateTrigger(id: number, input: UpdateAgentTriggerInput): AgentTrigger {
    const existing = agentTriggersRepository.get(id)
    if (!existing) {
      throw new Error(`Trigger ${id} not found`)
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

    // Get all enabled triggers for this event type
    const triggers = agentTriggersRepository.listByEventType(
      event.event_type,
      event.project_id ?? undefined
    )

    for (const trigger of triggers) {
      // Check if conditions match
      const eventPayload =
        typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload

      if (!matchConditions(trigger.conditions, eventPayload)) {
        continue
      }

      // Get the agent
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
   * Create an invocation for a trigger/event pair
   */
  invokeAgent(trigger: AgentTrigger, event: Event): AgentInvocation {
    // Create a session for this invocation
    const session = sessionsRepository.create()

    // Build invocation context
    const context: Record<string, unknown> = {
      event_id: event.id,
      event_type: event.event_type,
      project_id: event.project_id,
      ticket_id: event.ticket_id,
      comment_id: event.comment_id,
    }

    // Create the invocation
    const invocation = agentInvocationsRepository.create({
      agent_id: trigger.agent_id,
      trigger_id: trigger.id,
      event_id: event.id,
      session_id: session.id,
      context,
    })

    return invocation
  }

  /**
   * Run an agent invocation using the provided runner
   */
  async runAgent(
    invocationId: number,
    runner: AgentRunner
  ): Promise<AgentRunResult> {
    const invocation = agentInvocationsRepository.get(invocationId)
    if (!invocation) {
      throw new Error(`Invocation ${invocationId} not found`)
    }

    const agent = agentsRepository.get(invocation.agent_id)
    if (!agent) {
      throw new Error(`Agent ${invocation.agent_id} not found`)
    }

    // Get the triggering event
    const event = invocation.event_id
      ? (await import('@kombuse/persistence')).eventsRepository.get(
          invocation.event_id
        )
      : null

    if (!event) {
      return {
        success: false,
        invocation,
        error: 'Triggering event not found',
      }
    }

    // Mark as running
    agentInvocationsRepository.update(invocationId, {
      status: 'running',
      started_at: new Date().toISOString(),
    })

    // Create permission checker bound to this context
    const context: PermissionContext = { invocation, event }
    const checkPermission = (request: PermissionCheckRequest) =>
      this.checkPermission(agent, request, context)

    try {
      // Run the agent
      const { result, error } = await runner({
        agent,
        invocation,
        event,
        checkPermission,
      })

      if (error) {
        const failedInvocation = agentInvocationsRepository.update(
          invocationId,
          {
            status: 'failed',
            result: { error },
            completed_at: new Date().toISOString(),
          }
        )

        return {
          success: false,
          invocation: failedInvocation || invocation,
          error,
        }
      }

      // Mark as completed
      const completedInvocation = agentInvocationsRepository.update(
        invocationId,
        {
          status: 'completed',
          result,
          completed_at: new Date().toISOString(),
        }
      )

      return {
        success: true,
        invocation: completedInvocation || invocation,
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred'

      const failedInvocation = agentInvocationsRepository.update(invocationId, {
        status: 'failed',
        result: { error: errorMessage },
        completed_at: new Date().toISOString(),
      })

      return {
        success: false,
        invocation: failedInvocation || invocation,
        error: errorMessage,
      }
    }
  }

  /**
   * Process an event - find matching triggers and create invocations
   * Returns the created invocations
   */
  processEvent(event: Event): AgentInvocation[] {
    const matches = this.findMatchingTriggers(event)
    const invocations: AgentInvocation[] = []

    for (const { trigger } of matches) {
      const invocation = this.invokeAgent(trigger, event)
      invocations.push(invocation)
    }

    return invocations
  }
}

// Singleton instance for convenience
export const agentService = new AgentService()
