// =============================================================================
// Claude Code SDK Message Types
// Based on official SDK: https://platform.claude.com/docs/en/agent-sdk/typescript
// =============================================================================

// =============================================================================
// Common Types
// =============================================================================

export type ApiKeySource = 'user' | 'project' | 'org' | 'temporary'

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
}

export interface PermissionDenial {
  tool_name: string
  tool_use_id: string
  tool_input: unknown
}

// =============================================================================
// Content Blocks (from Anthropic API)
// =============================================================================

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | unknown[]; is_error?: boolean }

// =============================================================================
// SDK Message Types
// =============================================================================

/** System initialization message - emitted once at session start */
export interface ClaudeSystemMessage {
  type: 'system'
  subtype: 'init'
  uuid: string
  session_id: string
  apiKeySource: ApiKeySource
  cwd: string
  tools: string[]
  mcp_servers: { name: string; status: string }[]
  model: string
  permissionMode: PermissionMode
  slash_commands: string[]
  output_style: string
}

/** Compact boundary message - indicates conversation compaction */
export interface ClaudeCompactBoundaryMessage {
  type: 'system'
  subtype: 'compact_boundary'
  uuid: string
  session_id: string
  compact_metadata: {
    trigger: 'manual' | 'auto'
    pre_tokens: number
  }
}

/** User message to Claude */
export interface ClaudeUserMessage {
  type: 'user'
  uuid?: string
  session_id: string
  message: { role: 'user'; content: unknown }
  parent_tool_use_id: string | null
}

/** Assistant response */
export interface ClaudeAssistantMessage {
  type: 'assistant'
  uuid: string
  session_id: string
  message: { role: 'assistant'; content: ClaudeContentBlock[] }
  parent_tool_use_id: string | null
}

/** Successful result message */
export interface ClaudeResultSuccess {
  type: 'result'
  subtype: 'success'
  uuid: string
  session_id: string
  duration_ms: number
  duration_api_ms: number
  is_error: boolean
  num_turns: number
  result: string
  total_cost_usd: number
  usage: Usage
  modelUsage: Record<string, ModelUsage>
  permission_denials: PermissionDenial[]
  structured_output?: unknown
}

/** Error result message */
export interface ClaudeResultError {
  type: 'result'
  subtype:
    | 'error_max_turns'
    | 'error_during_execution'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  uuid: string
  session_id: string
  duration_ms: number
  duration_api_ms: number
  is_error: boolean
  num_turns: number
  total_cost_usd: number
  usage: Usage
  modelUsage: Record<string, ModelUsage>
  permission_denials: PermissionDenial[]
  errors: string[]
}

/** Session result - union of success and error */
export type ClaudeResultMessage = ClaudeResultSuccess | ClaudeResultError

/** Stream event - partial message (when includePartialMessages is true) */
export interface ClaudeStreamEvent {
  type: 'stream_event'
  uuid: string
  session_id: string
  event: unknown // RawMessageStreamEvent from Anthropic SDK
  parent_tool_use_id: string | null
}

// =============================================================================
// Control Messages (for CLI permission handling)
// =============================================================================

/** Permission request from Claude */
export interface ClaudeControlRequest {
  type: 'control_request'
  request_id: string
  request: {
    subtype: 'can_use_tool'
    tool_name: string
    tool_use_id: string
    input: Record<string, unknown>
  }
}

/** Control response (permission response) */
export interface ClaudeControlResponse {
  type: 'control_response'
  response: {
    subtype: 'success'
    request_id: string
    response:
      | { behavior: 'allow'; updatedInput: Record<string, unknown> }
      | { behavior: 'deny'; message: string }
  }
}

// =============================================================================
// Internal Message Types (process-level events)
// =============================================================================

export interface ClaudeStderrMessage {
  type: 'stderr'
  content: string
}

export interface ClaudeRawMessage {
  type: 'raw'
  content: string
}

export interface ClaudeProcessExit {
  type: 'process_exit'
  code: number | null
}

export interface ClaudeErrorMessage {
  type: 'error'
  message: string
}

// =============================================================================
// Event Groupings
// =============================================================================

/** SDK-native events emitted by Claude Code */
export type ClaudeSdkEvent =
  | ClaudeSystemMessage
  | ClaudeCompactBoundaryMessage
  | ClaudeUserMessage
  | ClaudeAssistantMessage
  | ClaudeResultMessage
  | ClaudeStreamEvent

/** Protocol-level events handled over stdio (SDK + control requests/responses) */
export type ClaudeProtocolEvent =
  | ClaudeSdkEvent
  | ClaudeControlRequest
  | ClaudeControlResponse

/** Runtime/process events generated locally while hosting Claude Code */
export type ClaudeRuntimeEvent =
  | ClaudeStderrMessage
  | ClaudeRawMessage
  | ClaudeProcessExit
  | ClaudeErrorMessage

/** Full event stream seen by the backend */
export type ClaudeEvent =
  | ClaudeProtocolEvent
  | ClaudeRuntimeEvent
