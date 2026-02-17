import type { BackendType } from './agent'

/**
 * Permission types for agents
 */

/**
 * Resource permission - controls access to database resources
 */
export interface ResourcePermission {
  type: 'resource'
  /** Resource pattern: 'ticket', 'comment', 'ticket.body', 'ticket.*', '*' */
  resource: string
  /** Allowed actions on the resource */
  actions: ('read' | 'create' | 'update' | 'delete' | '*')[]
  /** Permission scope */
  scope: 'invocation' | 'project' | 'global'
  /** Optional filter pattern: 'project:proj-*', 'status:open' */
  filter?: string
}

/**
 * Tool permission - controls access to MCP tools
 */
export interface ToolPermission {
  type: 'tool'
  /** Tool pattern: 'mcp__kombuse__*', 'mcp__github__get_issue', '*' */
  tool: string
  /** Permission scope */
  scope: 'invocation' | 'project' | 'global'
}

/**
 * Union of all permission types
 */
export type Permission = ResourcePermission | ToolPermission

/**
 * Provider-specific config for Anthropic models
 */
export interface AnthropicConfig {
  thinking?: boolean
  thinking_budget?: number
}

/**
 * Provider-specific config for OpenAI models
 */
export interface OpenAIConfig {
  response_format?: 'json' | 'text'
}

/**
 * Flexible agent configuration
 */
export interface AgentConfig {
  /** Preferred execution backend for this agent. */
  backend_type?: BackendType
  /** Model identifier: 'claude-sonnet-4-20250514', 'gpt-4o', etc. */
  model?: string
  /** Token limit for responses */
  max_tokens?: number
  /** Temperature: 0.0 - 1.0 */
  temperature?: number

  /** Anthropic-specific settings */
  anthropic?: AnthropicConfig
  /** OpenAI-specific settings */
  openai?: OpenAIConfig

  /** Whether to retry on failure */
  retry_on_failure?: boolean
  /** Maximum number of retries */
  max_retries?: number
  /** Timeout in milliseconds */
  timeout_ms?: number

  /** Whether this agent appears in the chat agent picker */
  enabled_for_chat?: boolean

  /** Maximum chain depth for loop detection */
  max_chain_depth?: number

  /** Additional custom settings */
  [key: string]: unknown
}

/**
 * Core agent entity (extends profile)
 */
export interface Agent {
  /** References profiles.id */
  id: string
  /** Kebab-case slug derived from agent name */
  slug: string | null
  /** System prompt for the agent */
  system_prompt: string
  /** JSON array of permission rules */
  permissions: Permission[]
  /** JSON object for flexible configuration */
  config: AgentConfig
  /** Whether the agent is enabled */
  is_enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * Input for creating an agent
 */
export interface CreateAgentInput {
  /** Profile ID for the agent (UUID). Auto-generated if not provided. */
  id?: string
  /** Display name for the agent profile (required) */
  name: string
  /** Description of the agent's purpose (required) */
  description: string
  /** Kebab-case slug (derived from name if not provided) */
  slug?: string
  system_prompt: string
  permissions?: Permission[]
  config?: AgentConfig
  is_enabled?: boolean
}

/**
 * Input for updating an agent
 */
export interface UpdateAgentInput {
  system_prompt?: string
  permissions?: Permission[]
  config?: AgentConfig
  is_enabled?: boolean
}

/**
 * Filters for listing agents
 */
export interface AgentFilters {
  is_enabled?: boolean
  enabled_for_chat?: boolean
  limit?: number
  offset?: number
}

/**
 * Agent trigger - defines when an agent should be invoked
 */
export interface AgentTrigger {
  id: number
  agent_id: string
  /** Event type: 'ticket.created', 'comment.added', etc. */
  event_type: string
  /** Optional: scope trigger to a specific project */
  project_id: string | null
  /** Optional: JSON filter conditions */
  conditions: Record<string, unknown> | null
  is_enabled: boolean
  /** Priority for ordering multiple triggers (higher = first) */
  priority: number
  created_at: string
  updated_at: string
}

/**
 * Input for creating an agent trigger
 */
export interface CreateAgentTriggerInput {
  agent_id: string
  event_type: string
  project_id?: string
  conditions?: Record<string, unknown>
  is_enabled?: boolean
  priority?: number
}

/**
 * Input for updating an agent trigger
 */
export interface UpdateAgentTriggerInput {
  event_type?: string
  project_id?: string | null
  conditions?: Record<string, unknown> | null
  is_enabled?: boolean
  priority?: number
}

/**
 * Agent invocation status
 */
export type InvocationStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * Agent invocation - tracks a single agent run
 */
export interface AgentInvocation {
  id: number
  agent_id: string
  trigger_id: number
  event_id: number | null
  session_id: string | null
  project_id: string | null
  /** App-level session ID (links to chat session for viewing/resuming) */
  kombuse_session_id: string | null
  status: InvocationStatus
  /** Number of execution attempts */
  attempts: number
  /** Max retry attempts allowed for this invocation */
  max_attempts: number
  /** Earliest time this invocation is eligible to run */
  run_at: string
  /** JSON: invocation context (ticket_id, project_id, etc.) */
  context: Record<string, unknown>
  /** JSON: outcome/error info */
  result: Record<string, unknown> | null
  /** Last error message (if failed) */
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

/**
 * Input for creating an agent invocation
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
 * Input for updating an agent invocation
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

/**
 * Filters for listing agent invocations
 */
export interface AgentInvocationFilters {
  agent_id?: string
  trigger_id?: number
  status?: InvocationStatus
  session_id?: string
  project_id?: string
  kombuse_session_id?: string
  limit?: number
  offset?: number
}
