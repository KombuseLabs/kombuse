import { z } from 'zod'
import { BACKEND_TYPES } from '../agent.types'
import { UUID_REGEX, SLUG_REGEX } from '../slug.types'

export const permissionActionSchema = z.enum(['read', 'create', 'update', 'delete', '*'])
export const permissionScopeSchema = z.enum(['invocation', 'project', 'global'])

export const resourcePermissionSchema = z.object({
  type: z.literal('resource'),
  resource: z.string().min(1),
  actions: z.array(permissionActionSchema).min(1),
  scope: permissionScopeSchema,
  filter: z.string().optional(),
})

export const toolPermissionSchema = z.object({
  type: z.literal('tool'),
  tool: z.string().min(1),
  scope: permissionScopeSchema,
})

export const permissionSchema = z.discriminatedUnion('type', [
  resourcePermissionSchema,
  toolPermissionSchema,
])

export const anthropicConfigSchema = z.object({
  thinking: z.boolean().optional(),
  thinking_budget: z.number().int().positive().optional(),
})

export const openaiConfigSchema = z.object({
  response_format: z.enum(['json', 'text']).optional(),
})

export const backendTypeSchema = z.enum([
  BACKEND_TYPES.CLAUDE_CODE,
  BACKEND_TYPES.CODEX,
  BACKEND_TYPES.MOCK,
])

export const agentConfigSchema = z.object({
  backend_type: backendTypeSchema.optional(),
  model: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(1).optional(),
  anthropic: anthropicConfigSchema.optional(),
  openai: openaiConfigSchema.optional(),
  retry_on_failure: z.boolean().optional(),
  max_retries: z.number().int().nonnegative().optional(),
  timeout_ms: z.number().int().positive().optional(),
  enabled_for_chat: z.boolean().optional(),
  can_invoke_agents: z.boolean().optional(),
  max_chain_depth: z.number().int().min(1).max(100).optional(),
  auto_approved_tools_override: z.array(z.string()).optional(),
  auto_approved_bash_commands_override: z.array(z.string()).optional(),
  min_backend_version: z.string().optional(),
}).catchall(z.unknown())

export const pluginBaseSchema = z.object({
  system_prompt: z.string().min(1),
  permissions: z.array(permissionSchema),
  config: agentConfigSchema,
  is_enabled: z.boolean(),
})

export const resolvedPresetSchema = z.object({
  type: z.string(),
  autoApprovedTools: z.array(z.string()),
  autoApprovedBashCommands: z.array(z.string()),
})

export const agentSchema = z.object({
  id: z.string().min(1),
  slug: z.string().nullable(),
  system_prompt: z.string().min(1),
  permissions: z.array(permissionSchema),
  config: agentConfigSchema,
  is_enabled: z.boolean(),
  plugin_id: z.string().nullable(),
  project_id: z.string().nullable(),
  plugin_base: pluginBaseSchema.nullable(),
  resolved_preset: resolvedPresetSchema.optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export const createAgentInputSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Must be a valid UUID').optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(SLUG_REGEX, 'Must be a valid kebab-case slug').optional(),
  system_prompt: z.string().min(1),
  permissions: z.array(permissionSchema).optional(),
  config: agentConfigSchema.optional(),
  is_enabled: z.boolean().optional(),
  plugin_id: z.string().nullable().optional(),
  plugin_base: pluginBaseSchema.nullable().optional(),
  project_id: z.string().nullable().optional(),
})

export const updateAgentInputSchema = z.object({
  system_prompt: z.string().min(1).optional(),
  permissions: z.array(permissionSchema).optional(),
  config: agentConfigSchema.optional(),
  is_enabled: z.boolean().optional(),
  plugin_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  plugin_base: pluginBaseSchema.nullable().optional(),
})

export const agentFiltersSchema = z.object({
  is_enabled: z.coerce.boolean().optional(),
  enabled_for_chat: z.coerce.boolean().optional(),
  project_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export const allowedInvokerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('any') }),
  z.object({ type: z.literal('user') }),
  z.object({
    type: z.literal('agent'),
    agent_id: z.string().min(1).optional(),
    agent_type: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('system') }),
])

export const agentTriggerSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().nullable(),
  agent_id: z.string().min(1),
  event_type: z.string().min(1),
  project_id: z.string().nullable(),
  conditions: z.record(z.string(), z.unknown()).nullable(),
  is_enabled: z.boolean(),
  priority: z.number().int().nonnegative(),
  plugin_id: z.string().nullable(),
  allowed_invokers: z.array(allowedInvokerSchema).nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export const createTriggerInputSchema = z.object({
  agent_id: z.string().min(1),
  event_type: z.string().min(1),
  slug: z.string().optional(),
  project_id: z.string().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  plugin_id: z.string().nullable().optional(),
  allowed_invokers: z.array(allowedInvokerSchema).optional(),
})

export const updateTriggerInputSchema = z.object({
  event_type: z.string().min(1).optional(),
  project_id: z.string().nullable().optional(),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  plugin_id: z.string().nullable().optional(),
  allowed_invokers: z.array(allowedInvokerSchema).nullable().optional(),
})

export const invocationStatusSchema = z.enum(['pending', 'running', 'completed', 'failed'])

export const agentInvocationSchema = z.object({
  id: z.number().int().positive(),
  agent_id: z.string().min(1),
  trigger_id: z.number().int().positive(),
  event_id: z.number().int().positive().nullable(),
  session_id: z.string().nullable(),
  project_id: z.string().nullable(),
  kombuse_session_id: z.string().nullable(),
  status: invocationStatusSchema,
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  run_at: z.string().min(1),
  context: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
})

export const invocationFiltersSchema = z.object({
  agent_id: z.string().optional(),
  trigger_id: z.coerce.number().int().positive().optional(),
  status: invocationStatusSchema.optional(),
  session_id: z.string().optional(),
  project_id: z.string().optional(),
  kombuse_session_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export const processEventInputSchema = z.object({
  event_id: z.coerce.number().int().positive(),
})

