import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { agentsRepository, profilesRepository } from '@kombuse/persistence'
import type {
  CreateAgentInput,
  UpdateAgentInput,
} from '@kombuse/types'
import {
  createAgentInputSchema,
  updateAgentInputSchema,
} from '@kombuse/types/schemas'
import { agentService } from '@kombuse/services'
import { z } from 'zod/v3'
import { resolveAgentContext, checkAgentPermission, checkAnonymousWriteAccess, permissionDeniedResponse } from './shared-permissions'

function validationErrorResponse(issues: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: 'Invalid input', issues }),
      },
    ],
    isError: true,
  }
}

type SharedParseResult = {
  success: boolean
  data?: unknown
  error?: { issues: unknown }
}

function safeParseShared(schema: unknown, input: unknown): SharedParseResult {
  const safeParse = (schema as { safeParse: (value: unknown) => unknown }).safeParse
  return safeParse(input) as SharedParseResult
}

/**
 * Register agent management MCP tools
 */
export function registerAgentTools(server: McpServer): void {
  const registerTool = (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool.bind(server) as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => void

  // Tool 1: list_agents
  registerTool(
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

      // Enrich with profile metadata
      const profileIds = agents.map((a) => a.id)
      const profiles = profilesRepository.getByIds(profileIds)
      const enriched = agents.map((agent) => ({
        ...agent,
        name: profiles.get(agent.id)?.name ?? agent.id,
        description: profiles.get(agent.id)?.description ?? null,
      }))

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ agents: enriched, count: enriched.length }, null, 2),
          },
        ],
      }
    }
  )

  // Tool 2: create_agent
  registerTool(
    'create_agent',
    {
      description:
        'Create a new agent. Returns the created agent.',
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe('Optional UUID for the agent (auto-generated if not provided)'),
        name: z
          .string()
          .min(1)
          .describe('Display name for the agent'),
        description: z
          .string()
          .min(1)
          .describe('Description of what the agent does'),
        slug: z
          .string()
          .optional()
          .describe('Optional kebab-case slug (derived from name if not provided)'),
        system_prompt: z
          .string()
          .min(1)
          .describe('The system prompt that defines the agent\'s behavior'),
        permissions: z
          .array(z.unknown())
          .optional()
          .describe('Array of permission objects (resource or tool permissions)'),
        config: z
          .record(z.string(), z.unknown())
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
    async ({ id, name, description, slug, system_prompt, permissions, config, is_enabled, kombuse_session_id }) => {
      const sharedParse = safeParseShared(createAgentInputSchema, {
        id,
        name,
        description,
        slug,
        system_prompt,
        permissions,
        config,
        is_enabled,
      })
      if (!sharedParse.success) {
        return validationErrorResponse(sharedParse.error?.issues ?? 'Invalid input')
      }

      const parsedInput = sharedParse.data as CreateAgentInput
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
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
        }
      }

      try {
        const agent = agentService.createAgent(parsedInput)

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
  registerTool(
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
          .array(z.unknown())
          .optional()
          .describe('New permissions array (replaces existing permissions)'),
        config: z
          .record(z.string(), z.unknown())
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
      const sharedParse = safeParseShared(updateAgentInputSchema, {
        system_prompt,
        permissions,
        config,
        is_enabled,
      })
      if (!sharedParse.success) {
        return validationErrorResponse(sharedParse.error?.issues ?? 'Invalid input')
      }

      const parsedInput = sharedParse.data as UpdateAgentInput
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
      } else {
        const anonCheck = checkAnonymousWriteAccess()
        if (!anonCheck.allowed) {
          return permissionDeniedResponse(anonCheck.reason ?? 'Anonymous write access denied')
        }
      }

      try {
        const agent = agentService.updateAgent(agent_id, parsedInput)

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
