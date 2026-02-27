import type { z } from 'zod'
import type {
  resourcePermissionSchema,
  toolPermissionSchema,
  permissionSchema,
  anthropicConfigSchema,
  openaiConfigSchema,
  agentConfigSchema,
  pluginBaseSchema,
  agentSchema,
  resolvedPresetSchema,
  createAgentInputSchema,
  updateAgentInputSchema,
  agentFiltersSchema,
  allowedInvokerSchema,
  agentTriggerSchema,
  createTriggerInputSchema,
  updateTriggerInputSchema,
  invocationStatusSchema,
  agentInvocationSchema,
  invocationFiltersSchema,
} from './schemas/agents'

// Derived from Zod schemas (single source of truth)
export type ResourcePermission = z.infer<typeof resourcePermissionSchema>
export type ToolPermission = z.infer<typeof toolPermissionSchema>
export type Permission = z.infer<typeof permissionSchema>
export type ResolvedPreset = z.infer<typeof resolvedPresetSchema>
export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>
export type OpenAIConfig = z.infer<typeof openaiConfigSchema>
export type AgentConfig = z.infer<typeof agentConfigSchema>
export type PluginBase = z.infer<typeof pluginBaseSchema>
export type Agent = z.infer<typeof agentSchema>
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>
export type AgentFilters = z.infer<typeof agentFiltersSchema>
export type AllowedInvoker = z.infer<typeof allowedInvokerSchema>
export type AgentTrigger = z.infer<typeof agentTriggerSchema>
export type CreateAgentTriggerInput = z.infer<typeof createTriggerInputSchema>
export type UpdateAgentTriggerInput = z.infer<typeof updateTriggerInputSchema>
export type InvocationStatus = z.infer<typeof invocationStatusSchema>
export type AgentInvocation = z.infer<typeof agentInvocationSchema>
export type AgentInvocationFilters = z.infer<typeof invocationFiltersSchema>

/**
 * Input for creating an agent invocation (no schema counterpart)
 */
export interface CreateAgentInvocationInput {
  agent_id: string
  trigger_id: number
  event_id?: number
  session_id?: string
  project_id?: string
  max_attempts?: number
  run_at?: string
  context: Record<string, unknown>
}

/**
 * Input for updating an agent invocation (no schema counterpart)
 */
export interface UpdateAgentInvocationInput {
  status?: InvocationStatus
  session_id?: string
  kombuse_session_id?: string
  attempts?: number
  max_attempts?: number
  run_at?: string
  result?: Record<string, unknown>
  error?: string | null
  started_at?: string
  completed_at?: string
}
