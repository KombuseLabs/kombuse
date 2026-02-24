import type { AgentInvocation, Permission } from './agents.types'
import type { Event } from './events.types'

/**
 * Context for permission checking while an agent invocation is running.
 */
export interface PermissionContext {
  /** The invocation that triggered this check. */
  invocation: AgentInvocation
  /** The event that triggered the invocation. */
  event?: Event
}

/**
 * Request to check a permission.
 */
export interface PermissionCheckRequest {
  /** Type of check: resource access or tool usage. */
  type: 'resource' | 'tool'
  /** For resource checks: the resource type (for example: 'ticket', 'comment'). */
  resource?: string
  /** For resource checks: the action being performed. */
  action?: 'read' | 'create' | 'update' | 'delete'
  /** For resource checks: the specific resource ID being accessed. */
  resourceId?: string | number
  /** For resource checks: the project the resource belongs to. */
  projectId?: string
  /** For tool checks: the tool name being invoked. */
  tool?: string
}

/**
 * Result of a permission check.
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  matchedPermission?: Permission
}
