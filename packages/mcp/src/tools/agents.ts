import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { agentsRepository, agentInvocationsRepository, eventsRepository } from '@kombuse/persistence'
import type {
  Agent,
  AgentInvocation,
  CreateAgentInput,
  PermissionCheckRequest,
  PermissionCheckResult,
  PermissionContext,
  Event,
  UpdateAgentInput,
} from '@kombuse/types'
import {
  createAgentInputSchema,
  updateAgentInputSchema,
} from '@kombuse/types/schemas'
import { agentService } from '@kombuse/services'
import { z } from 'zod/v3'

function toOptionalNumber(value: unknown): number | null {
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

function resolvePermissionEvent(invocation: AgentInvocation): Event | undefined {
  if (typeof invocation.event_id === 'number') {
    const event = eventsRepository.get(invocation.event_id)
    if (event) return event
  }

  const context = invocation.context
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return undefined
  }

  const contextRecord = context as Record<string, unknown>
  const contextEventId = toOptionalNumber(contextRecord.event_id)
  if (contextEventId !== null) {
    const event = eventsRepository.get(contextEventId)
    if (event) return event
  }

  const contextProjectId =
    typeof contextRecord.project_id === 'string' && contextRecord.project_id.trim().length > 0
      ? contextRecord.project_id
      : invocation.project_id
  const contextTicketId = toOptionalNumber(contextRecord.ticket_id)
  const contextCommentId = toOptionalNumber(contextRecord.comment_id)

  if (!contextProjectId && contextTicketId === null && contextCommentId === null) {
    return undefined
  }

  return {
    id: contextEventId ?? invocation.event_id ?? 0,
    event_type:
      typeof contextRecord.event_type === 'string' && contextRecord.event_type.trim().length > 0
        ? contextRecord.event_type
        : 'agent.invocation',
    project_id: contextProjectId ?? null,
    ticket_id: contextTicketId,
    comment_id: contextCommentId,
    actor_id: null,
    actor_type: 'agent',
    kombuse_session_id: invocation.kombuse_session_id,
    payload: '{}',
    created_at: invocation.created_at,
  }
}

function resolveAgentContext(kombuse_session_id?: string): {
  agent: Agent
  invocation: AgentInvocation
  event?: Event
} | null {
  if (!kombuse_session_id) return null

  const invocations = agentInvocationsRepository.list({ kombuse_session_id })
  if (invocations.length === 0) return null

  const invocation = invocations[0]!
  const agent = agentsRepository.get(invocation.agent_id)
  if (!agent) return null

  return {
    agent,
    invocation,
    event: resolvePermissionEvent(invocation),
  }
}

function checkAgentPermission(
  agentContext: { agent: Agent; invocation: AgentInvocation; event?: Event } | null,
  request: PermissionCheckRequest
): PermissionCheckResult {
  if (!agentContext) {
    return { allowed: true }
  }

  const requestWithProject =
    request.projectId === undefined && agentContext.event?.project_id
      ? { ...request, projectId: agentContext.event.project_id }
      : request

  const permissionContext: PermissionContext = {
    invocation: agentContext.invocation,
    event: agentContext.event,
  }

  return agentService.checkPermission(agentContext.agent, requestWithProject, permissionContext)
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
  registerTool(
    'create_agent',
    {
      description:
        'Create a new agent. Returns the created agent.',
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
    async ({ id, system_prompt, permissions, config, is_enabled, kombuse_session_id }) => {
      const sharedParse = safeParseShared(createAgentInputSchema, {
        id,
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
