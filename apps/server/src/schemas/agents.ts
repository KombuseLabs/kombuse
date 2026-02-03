import { z } from 'zod'

// Permission schemas
const resourcePermissionSchema = z.object({
  type: z.literal('resource'),
  resource: z.string().min(1),
  actions: z
    .array(z.enum(['read', 'create', 'update', 'delete', '*']))
    .min(1),
  scope: z.enum(['invocation', 'project', 'global']),
  filter: z.string().optional(),
})

const toolPermissionSchema = z.object({
  type: z.literal('tool'),
  tool: z.string().min(1),
  scope: z.enum(['invocation', 'project', 'global']),
})

const permissionSchema = z.discriminatedUnion('type', [
  resourcePermissionSchema,
  toolPermissionSchema,
])

// Agent config schema
const anthropicConfigSchema = z.object({
  thinking: z.boolean().optional(),
  thinking_budget: z.number().int().positive().optional(),
})

const openaiConfigSchema = z.object({
  response_format: z.enum(['json', 'text']).optional(),
})

const agentConfigSchema = z
  .object({
    model: z.string().optional(),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(1).optional(),
    anthropic: anthropicConfigSchema.optional(),
    openai: openaiConfigSchema.optional(),
    retry_on_failure: z.boolean().optional(),
    max_retries: z.number().int().nonnegative().optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .passthrough() // Allow additional custom settings

// Agent schemas
export const createAgentSchema = z.object({
  id: z.string().min(1),
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
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

// Trigger schemas
export const createTriggerSchema = z.object({
  event_type: z.string().min(1),
  project_id: z.string().optional(),
  conditions: z.record(z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
  priority: z.coerce.number().int().nonnegative().optional(),
})

export const updateTriggerSchema = z.object({
  event_type: z.string().min(1).optional(),
  project_id: z.string().nullable().optional(),
  conditions: z.record(z.unknown()).nullable().optional(),
  is_enabled: z.boolean().optional(),
  priority: z.coerce.number().int().nonnegative().optional(),
})

// Invocation filters schema
export const invocationFiltersSchema = z.object({
  agent_id: z.string().optional(),
  trigger_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  session_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

// Process event schema
export const processEventSchema = z.object({
  event_id: z.coerce.number().int().positive(),
})

// Export types
export type CreateAgentBody = z.infer<typeof createAgentSchema>
export type UpdateAgentBody = z.infer<typeof updateAgentSchema>
export type AgentFiltersQuery = z.infer<typeof agentFiltersSchema>
export type CreateTriggerBody = z.infer<typeof createTriggerSchema>
export type UpdateTriggerBody = z.infer<typeof updateTriggerSchema>
export type InvocationFiltersQuery = z.infer<typeof invocationFiltersSchema>
export type ProcessEventBody = z.infer<typeof processEventSchema>
