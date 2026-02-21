import type {
  Agent,
  AgentFilters,
  AgentTrigger,
  AgentInvocation,
  AgentInvocationFilters,
  AllowedInvoker,
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
import { toSlug, UUID_REGEX } from '@kombuse/types'
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
  listAgents(filters?: AgentFilters): Agent[]
  getAgent(id: string): Agent | null
  getAgentBySlug(slug: string): Agent | null
  createAgent(input: CreateAgentInput): Agent
  updateAgent(id: string, input: UpdateAgentInput): Agent
  deleteAgent(id: string): void
  resetAgentToPluginDefaults(agentId: string): Agent

  // Trigger CRUD
  listTriggers(agentId: string): AgentTrigger[]
  listTriggersByLabelId(labelId: number): AgentTrigger[]
  listSmartLabelIds(projectId?: string): number[]
  getTrigger(id: number): AgentTrigger | null
  createTrigger(input: CreateAgentTriggerInput): AgentTrigger
  updateTrigger(id: number, input: UpdateAgentTriggerInput): AgentTrigger
  deleteTrigger(id: number): void

  // Invocation management
  listInvocations(filters?: AgentInvocationFilters): AgentInvocation[]
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
 * Check if conditions match an event payload.
 *
 * Supports:
 * - Strict equality: `{ label_id: 4 }` matches when `payload.label_id === 4`
 * - Negation via `exclude_` prefix: `{ exclude_agent_id: 'x' }` matches when
 *   `payload.agent_id !== 'x'`
 * - Array containment (payload is array): if the payload value is an array,
 *   `{ changes: 'status' }` matches when `payload.changes` includes `'status'`
 * - Array containment (condition is array): if the condition value is an array,
 *   `{ author_id: ['id-1', 'id-2'] }` matches when `payload.author_id` is in the array
 */
function matchConditions(
  conditions: Record<string, unknown> | null,
  eventPayload: Record<string, unknown>
): boolean {
  if (!conditions) return true

  for (const [key, expectedValue] of Object.entries(conditions)) {
    // Negation: exclude_ prefix means the payload field must NOT equal the value
    if (key.startsWith('exclude_')) {
      const payloadKey = key.slice('exclude_'.length)
      const actualValue = eventPayload[payloadKey]
      if (actualValue === expectedValue) {
        return false
      }
      continue
    }

    const actualValue = eventPayload[key]

    // Array containment: if the payload value is an array, check includes
    if (Array.isArray(actualValue)) {
      if (!actualValue.includes(expectedValue)) {
        return false
      }
      continue
    }

    // Condition-side array: if the condition value is an array, check if payload value is in it
    if (Array.isArray(expectedValue)) {
      if (!expectedValue.includes(actualValue)) {
        return false
      }
      continue
    }

    if (actualValue !== expectedValue) {
      return false
    }
  }

  return true
}

/**
 * Check if an event's actor is allowed to fire a trigger.
 * Returns true if the invoker is allowed, false otherwise.
 *
 * - null or empty array = allow all (backwards-compatible)
 * - Non-empty array = OR semantics (any matching rule = allowed)
 */
function checkAllowedInvokers(
  allowedInvokers: AllowedInvoker[] | null,
  event: Event,
  invokerAgentType?: string | null,
): boolean {
  if (!allowedInvokers || allowedInvokers.length === 0) {
    return true
  }

  return allowedInvokers.some((rule) => {
    switch (rule.type) {
      case 'any':
        return true
      case 'user':
        return event.actor_type === 'user'
      case 'system':
        return event.actor_type === 'system'
      case 'agent': {
        if (event.actor_type !== 'agent') return false
        if (rule.agent_id && rule.agent_id !== event.actor_id) return false
        if (rule.agent_type && rule.agent_type !== invokerAgentType) return false
        return true
      }
      default:
        return false
    }
  })
}

/**
 * Agent service implementation
 */
export class AgentService implements IAgentService {
  // ============================================
  // Agent CRUD
  // ============================================

  listAgents(filters?: AgentFilters): Agent[] {
    return agentsRepository.list(filters)
  }

  getAgent(id: string): Agent | null {
    return agentsRepository.get(id)
  }

  getAgentBySlug(slug: string): Agent | null {
    return agentsRepository.getBySlug(slug)
  }

  createAgent(input: CreateAgentInput): Agent {
    // Generate UUID if id not provided; reject non-UUID id
    const id = input.id ?? crypto.randomUUID()
    if (input.id && !UUID_REGEX.test(input.id)) {
      throw new Error('Agent ID must be a valid UUID')
    }

    // Derive slug from name if not provided
    const slug = input.slug ?? toSlug(input.name)
    const existingBySlug = agentsRepository.getBySlug(slug)
    if (existingBySlug) {
      throw new Error(`Agent with slug '${slug}' already exists`)
    }

    // Auto-create agent profile if missing
    let profile = profilesRepository.get(id)
    if (!profile) {
      profile = profilesRepository.create({
        id,
        type: 'agent',
        name: input.name,
        description: input.description,
      })
    }
    if (profile.type !== 'agent') {
      throw new Error(`Profile ${id} is not of type 'agent'`)
    }

    return agentsRepository.create({ ...input, id, slug })
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

  resetAgentToPluginDefaults(agentId: string): Agent {
    const agent = agentsRepository.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }
    if (!agent.plugin_base) {
      throw new Error(`Agent ${agentId} has no plugin defaults to reset to`)
    }

    const reset = agentsRepository.resetToPluginBase(agentId)
    if (!reset) {
      throw new Error(`Failed to reset agent ${agentId}`)
    }
    return reset
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

  listSmartLabelIds(projectId?: string): number[] {
    return agentTriggersRepository.listSmartLabelIds(projectId)
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

  listInvocations(filters?: AgentInvocationFilters): AgentInvocation[] {
    return agentInvocationsRepository.list(filters)
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

    // Lazy lookup: resolve invoking agent's config.type once, only if needed
    let invokerAgentType: string | null | undefined // undefined = not yet resolved
    const getInvokerAgentType = (): string | null => {
      if (invokerAgentType !== undefined) return invokerAgentType
      if (event.actor_type !== 'agent' || !event.actor_id) {
        invokerAgentType = null
        return null
      }
      const invokerAgent = agentsRepository.get(event.actor_id)
      invokerAgentType = typeof invokerAgent?.config?.type === 'string'
        ? invokerAgent.config.type
        : null
      return invokerAgentType
    }

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

      const needsAgentType = trigger.allowed_invokers?.some(
        (r) => r.type === 'agent' && r.agent_type
      )
      const resolvedType = needsAgentType ? getInvokerAgentType() : undefined

      if (!checkAllowedInvokers(trigger.allowed_invokers, event, resolvedType)) {
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

  private readInvocationContext(
    context: PermissionContext
  ): Record<string, unknown> | null {
    const raw = context.invocation.context
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null
    }
    return raw as Record<string, unknown>
  }

  private readInvocationContextString(
    context: PermissionContext,
    key: string
  ): string | null {
    const invocationContext = this.readInvocationContext(context)
    const value = invocationContext?.[key]
    if (typeof value !== 'string') {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private readInvocationContextNumber(
    context: PermissionContext,
    key: string
  ): number | null {
    const invocationContext = this.readInvocationContext(context)
    const value = invocationContext?.[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length === 0) return null
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed)
      }
    }

    return null
  }

  private resolveContextProjectId(context: PermissionContext): string | null {
    if (context.event?.project_id) {
      return context.event.project_id
    }
    if (context.invocation.project_id) {
      return context.invocation.project_id
    }
    return this.readInvocationContextString(context, 'project_id')
  }

  private resolveContextTicketId(context: PermissionContext): number | null {
    if (typeof context.event?.ticket_id === 'number') {
      return context.event.ticket_id
    }
    return this.readInvocationContextNumber(context, 'ticket_id')
  }

  private resolveContextCommentId(context: PermissionContext): number | null {
    if (typeof context.event?.comment_id === 'number') {
      return context.event.comment_id
    }
    return this.readInvocationContextNumber(context, 'comment_id')
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
        // Fail closed: project-scoped permissions require both sides.
        if (!request.projectId) {
          return false
        }
        return this.resolveContextProjectId(context) === request.projectId

      case 'invocation':
        // Check resource is related to the triggering event
        const ticketId = this.resolveContextTicketId(context)
        const commentId = this.resolveContextCommentId(context)

        // For now, we check if the resource ID matches the event's ticket/comment
        if (request.resource === 'ticket' && ticketId !== null) {
          return String(request.resourceId) === String(ticketId)
        }
        if (request.resource === 'comment' && commentId !== null) {
          return String(request.resourceId) === String(commentId)
        }
        // For create operations on comments, check the ticket context
        if (
          request.resource === 'comment' &&
          request.action === 'create' &&
          ticketId !== null
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
      project_id: event.project_id ?? undefined,
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
