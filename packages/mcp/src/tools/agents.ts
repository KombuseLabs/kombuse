import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { agentsRepository, agentInvocationsRepository } from '@kombuse/persistence'
import type { Agent, AgentInvocation, PermissionCheckRequest, PermissionCheckResult, PermissionContext } from '@kombuse/types'
import { agentService } from '@kombuse/services'
import { z } from 'zod'

function resolveAgentContext(kombuse_session_id?: string): {
  agent: Agent
  invocation: AgentInvocation
} | null {
  if (!kombuse_session_id) return null

  const invocations = agentInvocationsRepository.list({ kombuse_session_id })
  if (invocations.length === 0) return null

  const invocation = invocations[0]!
  const agent = agentsRepository.get(invocation.agent_id)
  if (!agent) return null

  return { agent, invocation }
}

function checkAgentPermission(
  agentContext: { agent: Agent; invocation: AgentInvocation } | null,
  request: PermissionCheckRequest
): PermissionCheckResult {
  if (!agentContext) {
    return { allowed: true }
  }

  const permissionContext: PermissionContext = {
    invocation: agentContext.invocation,
  }

  return agentService.checkPermission(agentContext.agent, request, permissionContext)
}

function permissionDeniedResponse(reason: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: `Permission denied: ${reason}` }),
      },
    ],
    isError: true,
  }
}

// Permission schemas (inline — same as apps/server/src/schemas/agents.ts but for MCP input)
const resourcePermissionSchema = z.object({
  type: z.literal('resource'),
  resource: z.string().min(1),
  actions: z.array(z.enum(['read', 'create', 'update', 'delete', '*'])).min(1),
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

const agentConfigSchema = z
  .object({
    model: z.string().optional(),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(1).optional(),
    anthropic: z.object({
      thinking: z.boolean().optional(),
      thinking_budget: z.number().int().positive().optional(),
    }).optional(),
    openai: z.object({
      response_format: z.enum(['json', 'text']).optional(),
    }).optional(),
    retry_on_failure: z.boolean().optional(),
    max_retries: z.number().int().nonnegative().optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .passthrough()

/**
 * Register agent management MCP tools
 */
export function registerAgentTools(server: McpServer): void {
  // Tool 1: list_agents
  server.registerTool(
    'list_agents',
    {
      description:
        'List agents with optional filters. Returns agents sorted by creation time.',
      inputSchema: {
        is_enabled: z
          .boolean()
          .optional()
          .describe('Filter by enabled/disabled status'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of agents to return (default: 50, max: 100)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of agents to skip for pagination (default: 0)'),
      },
    },
    async ({ is_enabled, limit, offset }) => {
      const agents = agentsRepository.list({
        is_enabled,
        limit: limit ?? 50,
        offset: offset ?? 0,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ agents, count: agents.length }, null, 2),
          },
        ],
      }
    }
  )

  // Tool 2: create_agent
  server.registerTool(
    'create_agent',
    {
      description:
        'Create a new agent. The agent ID must reference an existing profile with type "agent". Returns the created agent.',
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe('The agent profile ID (must reference an existing profile with type "agent")'),
        system_prompt: z
          .string()
          .min(1)
          .describe('The system prompt that defines the agent\'s behavior'),
        permissions: z
          .array(permissionSchema)
          .optional()
          .describe('Array of permission objects (resource or tool permissions)'),
        config: agentConfigSchema
          .optional()
          .describe('Agent configuration (model, max_tokens, temperature, provider settings, etc.)'),
        is_enabled: z
          .boolean()
          .optional()
          .describe('Whether the agent is enabled (default: true)'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID for permission enforcement'),
      },
    },
    async ({ id, system_prompt, permissions, config, is_enabled, kombuse_session_id }) => {
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        const result = checkAgentPermission(agentContext, {
          type: 'resource',
          resource: 'agent',
          action: 'create',
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot create agents')
        }
      }

      try {
        const agent = agentService.createAgent({
          id,
          system_prompt,
          permissions,
          config,
          is_enabled,
        })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(agent, null, 2),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        }
      }
    }
  )

  // Tool 3: update_agent
  server.registerTool(
    'update_agent',
    {
      description:
        'Update an existing agent. Can change system_prompt, permissions, config, and is_enabled. Returns the updated agent.',
      inputSchema: {
        agent_id: z
          .string()
          .min(1)
          .describe('The ID of the agent to update'),
        system_prompt: z
          .string()
          .min(1)
          .optional()
          .describe('New system prompt for the agent'),
        permissions: z
          .array(permissionSchema)
          .optional()
          .describe('New permissions array (replaces existing permissions)'),
        config: agentConfigSchema
          .optional()
          .describe('New agent configuration (replaces existing config)'),
        is_enabled: z
          .boolean()
          .optional()
          .describe('Enable or disable the agent'),
        kombuse_session_id: z
          .string()
          .optional()
          .describe('Optional session ID for permission enforcement'),
      },
    },
    async ({ agent_id, system_prompt, permissions, config, is_enabled, kombuse_session_id }) => {
      const agentContext = resolveAgentContext(kombuse_session_id)
      if (agentContext) {
        const result = checkAgentPermission(agentContext, {
          type: 'resource',
          resource: 'agent',
          action: 'update',
          resourceId: agent_id,
        })
        if (!result.allowed) {
          return permissionDeniedResponse(result.reason ?? 'Cannot update agents')
        }
      }

      try {
        const agent = agentService.updateAgent(agent_id, {
          system_prompt,
          permissions,
          config,
          is_enabled,
        })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(agent, null, 2),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        }
      }
    }
  )
}
