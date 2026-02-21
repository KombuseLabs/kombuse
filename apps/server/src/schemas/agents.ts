import { z } from 'zod'
import {
  permissionSchema,
  agentConfigSchema,
  allowedInvokerSchema,
} from '@kombuse/types/schemas'
import { UUID_REGEX, SLUG_REGEX } from '@kombuse/types'

// Agent schemas
export const createAgentSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Must be a valid UUID').optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(SLUG_REGEX, 'Must be a valid kebab-case slug').optional(),
  system_prompt: z.string().min(1),
  permissions: z.array(permissionSchema).optional(),
  config: agentConfigSchema.optional(),
  is_enabled: z.boolean().optional(),
})

export const updateAgentSchema = z.object({
  system_prompt: z.string().min(1).optional(),
  permissions: z.array(permissionSchema).optional(),
  config: agentConfigSchema.optional(),
  is_enabled: z.boolean().optional(),
})

export const agentFiltersSchema = z.object({
  is_enabled: z.coerce.boolean().optional(),
  enabled_for_chat: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

// Trigger schemas
export const createTriggerSchema = z.object({
  event_type: z.string().min(1),
  slug: z.string().regex(SLUG_REGEX, 'Must be a valid kebab-case slug').optional(),
  project_id: z.string().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
  priority: z.coerce.number().int().nonnegative().optional(),
  allowed_invokers: z.array(allowedInvokerSchema).optional(),
})

export const updateTriggerSchema = z.object({
  event_type: z.string().min(1).optional(),
  project_id: z.string().nullable().optional(),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  is_enabled: z.boolean().optional(),
  priority: z.coerce.number().int().nonnegative().optional(),
  allowed_invokers: z.array(allowedInvokerSchema).nullable().optional(),
})

// Invocation filters schema
export const invocationFiltersSchema = z.object({
  agent_id: z.string().optional(),
  trigger_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  session_id: z.string().optional(),
  project_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

// Process event schema
export const processEventSchema = z.object({
  event_id: z.coerce.number().int().positive(),
})

// Agent export schema
export const agentExportSchema = z.object({
  directory: z.string().min(1),
  agent_ids: z.array(z.string().min(1)).optional(),
})

// Agent export result schema (response validation)
export const agentExportResultSchema = z.object({
  directory: z.string().min(1),
  count: z.number().int().nonnegative(),
  files: z.array(z.string()),
})

// Export types
export type AgentExportBody = z.infer<typeof agentExportSchema>
export type CreateAgentBody = z.infer<typeof createAgentSchema>
export type UpdateAgentBody = z.infer<typeof updateAgentSchema>
export type AgentFiltersQuery = z.infer<typeof agentFiltersSchema>
export type CreateTriggerBody = z.infer<typeof createTriggerSchema>
export type UpdateTriggerBody = z.infer<typeof updateTriggerSchema>
export type InvocationFiltersQuery = z.infer<typeof invocationFiltersSchema>
export type ProcessEventBody = z.infer<typeof processEventSchema>
