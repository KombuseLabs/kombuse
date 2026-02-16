/**
 * Shared backend contract for agent implementers.
 * Keep this file backend-agnostic and runtime-independent.
 */

import type { KombuseSessionId } from './session-id'

/** CLI permission mode controlling how the agent interacts with tools. */
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

/** A base64-encoded image attachment for multimodal messages. */
export interface ImageAttachment {
  /** Base64-encoded image data (no data: URI prefix) */
  data: string
  /** MIME type, e.g. 'image/png', 'image/jpeg' */
  mediaType: string
}

/**
 * Configuration for starting an agent backend
 */
export interface StartOptions {
  /** Stable app-level session ID (kombuse_session_id). */
  kombuseSessionId: KombuseSessionId
  /** Optional backend-native session ID to resume conversation context. */
  resumeSessionId?: string
  /** Optional model preference to apply when backend supports explicit model selection. */
  model?: string
  projectPath: string
  systemPrompt?: string
  permissions?: PermissionConfig
  initialMessage?: string
  /** Optional image attachments to include with the initial message. */
  initialImages?: ImageAttachment[]
  /** Maximum number of agentic turns before stopping. No limit by default (matches Claude Code CLI default). */
  maxTurns?: number
  /** Tools pre-approved at the subprocess level via --allowedTools. */
  allowedTools?: string[]
  /** Permission mode for the CLI session (e.g. 'plan' forces plan-first workflow). */
  permissionMode?: PermissionMode
}

/**
 * Permission configuration for agent operations
 */
export interface PermissionConfig {
  allowedTools?: string[]
  deniedTools?: string[]
  requireApproval?: boolean
}

/**
 * Conversation context for tracking chat sessions
 */
export interface ConversationContext {
  /** Our stable ID (generated upfront) */
  kombuseSessionId: KombuseSessionId
  /** Backend-specific session ID (async, stored when available) */
  backendSessionId?: string
}

/** Backend type identifiers */
export const BACKEND_TYPES = {
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex',
  MOCK: 'mock',
} as const

export type BackendType = (typeof BACKEND_TYPES)[keyof typeof BACKEND_TYPES]

/** Role of a text message emitted by an agent */
export type AgentMessageRole = 'assistant' | 'user' | 'system'

/** Common metadata for all agent events */
export interface AgentEventBase {
  eventId: string
  type: string
  backend: BackendType
  timestamp: number
}

/** Human-readable message event */
export interface AgentMessageEvent extends AgentEventBase {
  type: 'message'
  role: AgentMessageRole
  content: string
  raw?: unknown
}

/** Tool invocation request emitted by an agent */
export interface AgentToolUseEvent extends AgentEventBase {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  raw?: unknown | any
}

/** Tool execution result emitted by an agent */
export interface AgentToolResultEvent extends AgentEventBase {
  type: 'tool_result'
  toolUseId: string
  content: string | unknown[]
  isError?: boolean
  raw?: unknown
}

/** Permission request from an agent backend */
export interface AgentPermissionRequestEvent extends AgentEventBase {
  type: 'permission_request'
  requestId: string
  toolName: string
  toolUseId: string
  input: Record<string, unknown>
  /** Human-readable description of what this permission request will do */
  description?: string
  /** True if this permission was auto-approved by the server */
  autoApproved?: boolean
  raw?: unknown
}

/** Permission response persisted by the server when a user allows/denies a request */
export interface AgentPermissionResponseEvent extends AgentEventBase {
  type: 'permission_response'
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
}

/** Opaque backend event forwarded for debugging/inspection */
export interface AgentRawEvent extends AgentEventBase {
  type: 'raw'
  sourceType?: string
  data: unknown | any
}

/** Error event from an agent backend */
export interface AgentErrorEvent extends AgentEventBase {
  type: 'error'
  message: string
  error?: Error
  raw?: unknown
}

export type AgentCompleteReason = 'result' | 'process_exit' | 'mock_complete' | 'stopped' | 'failed'

/** Completion event from an agent backend */
export interface AgentCompleteEvent extends AgentEventBase {
  type: 'complete'
  reason: AgentCompleteReason
  sessionId?: string
  exitCode?: number | null
  success?: boolean
  /** Human-readable error message when success is false */
  errorMessage?: string
  /** True when the CLI returned a "session does not exist" or similar resume error */
  resumeFailed?: boolean
  raw?: unknown
}

export type AgentBackendLifecycleState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'

/** Backend lifecycle event emitted for internal lifecycle coordination. */
export interface AgentLifecycleEvent extends AgentEventBase {
  type: 'lifecycle'
  state: AgentBackendLifecycleState
  reason?: string
  errorMessage?: string
}

/** Stable backend-agnostic event union */
export type AgentEvent =
  | AgentMessageEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentPermissionRequestEvent
  | AgentPermissionResponseEvent
  | AgentRawEvent
  | AgentErrorEvent
  | AgentCompleteEvent
  | AgentLifecycleEvent

/**
 * JSON-safe types used for websocket payload serialization
 */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export interface SerializedError {
  name: string
  message: string
  stack?: string
}

export type SerializedAgentMessageEvent = Omit<AgentMessageEvent, 'raw'> & {
  raw?: JsonValue
}

export type SerializedAgentToolUseEvent = Omit<AgentToolUseEvent, 'input' | 'raw'> & {
  input: JsonObject
  raw?: JsonValue
}

export type SerializedAgentToolResultEvent = Omit<AgentToolResultEvent, 'content' | 'raw'> & {
  content: string | JsonValue[]
  raw?: JsonValue
}

export type SerializedAgentPermissionRequestEvent = Omit<AgentPermissionRequestEvent, 'input' | 'raw'> & {
  input: JsonObject
  raw?: JsonValue
}

export type SerializedAgentPermissionResponseEvent = AgentPermissionResponseEvent

export type SerializedAgentRawEvent = Omit<AgentRawEvent, 'data'> & {
  data: JsonValue
}

export type SerializedAgentErrorEvent = Omit<AgentErrorEvent, 'error' | 'raw'> & {
  error?: SerializedError
  raw?: JsonValue
}

export type SerializedAgentCompleteEvent = Omit<AgentCompleteEvent, 'raw'> & {
  raw?: JsonValue
}

export type SerializedAgentLifecycleEvent = AgentLifecycleEvent

export type SerializedAgentEvent =
  | SerializedAgentMessageEvent
  | SerializedAgentToolUseEvent
  | SerializedAgentToolResultEvent
  | SerializedAgentPermissionRequestEvent
  | SerializedAgentPermissionResponseEvent
  | SerializedAgentRawEvent
  | SerializedAgentErrorEvent
  | SerializedAgentCompleteEvent
  | SerializedAgentLifecycleEvent

export interface PermissionResponseOptions {
  updatedInput?: Record<string, unknown>
  message?: string
}

/**
 * Agent backend interface - abstraction over Claude, Codex, or mock implementations
 */
export interface AgentBackend {
  readonly name: BackendType

  /**
   * Start the agent with the given options
   */
  start(options: StartOptions): Promise<void>

  /**
   * Stop the agent
   */
  stop(): Promise<void>

  /**
   * Send a message to the agent
   */
  send(message: string, images?: ImageAttachment[]): void

  /**
   * Optional capability for permission-response handling.
   */
  respondToPermission?(
    requestId: string,
    behavior: 'allow' | 'deny',
    options?: PermissionResponseOptions
  ): void

  /**
   * Subscribe to agent events. Returns an unsubscribe function.
   */
  subscribe(handler: (event: AgentEvent) => void): () => void

  /**
   * Check if the agent is currently running
   */
  isRunning(): boolean

  /**
   * Get backend-native session ID, if available.
   */
  getBackendSessionId(): string | undefined
}
