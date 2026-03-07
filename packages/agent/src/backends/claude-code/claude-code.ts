import {
  BACKEND_TYPES,
  type AgentEvent,
  type ImageAttachment,
  type PermissionResponseOptions,
  type StartOptions,
} from '../../types'
import { Process, waitForRunning } from '../../utils'
import { createAppLogger } from '@kombuse/core/logger'
import { BaseAgentBackend } from '../base-agent-backend'

const logger = createAppLogger('ClaudeCode')
import { resolveClaudePath, createCleanEnv, createJsonLineBehavior, type ParsedClaudeMessage } from './utils'
import type { ClaudeAssistantMessage, ClaudeContentBlock, ClaudeEvent, ClaudeResultMessage, ClaudeUserMessage } from './types'

export interface ClaudeCodeOptions {
  /** Path to claude CLI executable (default: 'claude') */
  cliPath?: string
  /** Additional CLI arguments */
  extraArgs?: string[]
  /** Enable extended thinking mode */
  thinkingEnabled?: boolean
}

export type MultimodalContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export function buildUserContent(
  text: string,
  images?: ImageAttachment[]
): string | MultimodalContentBlock[] {
  if (!images || images.length === 0) return text
  const blocks: MultimodalContentBlock[] = []
  if (text) {
    blocks.push({ type: 'text', text })
  }
  for (const img of images) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    })
  }
  return blocks
}

/**
 * Input events sent to Claude CLI via stdin
 */
export type ClaudeInputEvent =
  | { type: 'user'; message: { role: 'user'; content: string | MultimodalContentBlock[] } }
  | { type: 'tool_result'; tool_result: { id: string; output: string; is_error?: boolean } }
  | {
      type: 'control_response'
      response: {
        subtype: 'success'
        request_id: string
        response:
          | { behavior: 'allow'; updatedInput: Record<string, unknown> }
          | { behavior: 'deny'; message: string }
      }
    }

/**
 * Agent backend that spawns Claude Code CLI as a subprocess.
 * Leverages existing CLI configuration (API keys, AGENTS.md, MCP servers, etc.)
 */
export class ClaudeCodeBackend extends BaseAgentBackend {
  readonly name = BACKEND_TYPES.CLAUDE_CODE

  private process: Process | null = null
  private skipResultEvents = false
  private hasEmittedAssistantMessage = false
  private options: Required<ClaudeCodeOptions>
  private stderrBuffer: string[] = []

  constructor(options: ClaudeCodeOptions = {}) {
    super()
    this.options = {
      cliPath: options.cliPath ?? resolveClaudePath(),
      extraArgs: options.extraArgs ?? [],
      thinkingEnabled: options.thinkingEnabled ?? false,
    }
  }

  protected override emitEvent(event: AgentEvent): void {
    if (event.type === 'message' && 'role' in event && event.role === 'assistant') {
      this.hasEmittedAssistantMessage = true
    }
    super.emitEvent(event)
  }

  async start(options: StartOptions): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Claude Code backend is already running')
    }

    this.starting()
    this.clearBackendSessionId()
    this.skipResultEvents = false
    this.hasEmittedAssistantMessage = false
    this.stderrBuffer = []

    const args = this.buildArgs(options)

    const jsonLineBehavior = createJsonLineBehavior({
      onMessage: (msg) => this.handleMessage(msg),
    })
    this.process = new Process(
      {
        command: this.options.cliPath,
        args,
        cwd: options.projectPath,
        env: createCleanEnv({
          thinkingEnabled: this.options.thinkingEnabled,
        }),
        inheritEnv: false,
        name: 'claude-code',
      },
      {
        onSpawn: (pid) => {
          this.emitEvent(this.createRawEvent({ pid }, 'process_spawn'))
        },
        onStderr: (data) => {
          this.stderrBuffer.push(data)
          this.emitEvent(this.createRawEvent({ stderr: data }, 'process_stderr'))
        },
        onError: (error) => {
          this.process = null
          this.failed(`CLI path: ${this.options.cliPath} — ${error.message}`, {
            reason: 'process_error',
            error,
          })
        },
      },
      [jsonLineBehavior]
    )

    try {
      logger.info('Starting Claude Code', { cliPath: this.options.cliPath, projectPath: options.projectPath })
      await this.process.spawn()
      await waitForRunning(this.process)
      this.started()
      await this.sendRaw({
        type: 'user',
        message: {
          role: 'user',
          content: buildUserContent(
            options.initialMessage || 'Message Error: No initial prompt provided.',
            options.initialImages
          ),
        },
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Claude Code start failed', { cliPath: this.options.cliPath, error: err.message })
      this.process = null
      if (this.getLifecycleState() !== 'failed' && this.getLifecycleState() !== 'stopped') {
        this.failed(err.message, {
          reason: 'start_failed',
          error: err,
        })
      }
      throw error
    }
  }

  async stop(): Promise<void> {
    const lifecycleState = this.getLifecycleState()
    if (lifecycleState === 'stopped' || lifecycleState === 'failed' || lifecycleState === 'stopping') {
      return
    }

    this.stopping('user_stop')
    this.skipResultEvents = true
    if (this.process?.isRunning) {
      this.process.kill('SIGTERM')
    }
    this.process = null
    this.stopped({
      reason: 'user_stop',
      complete: {
        reason: 'stopped',
        sessionId: this.getBackendSessionId(),
        success: false,
        errorMessage: 'Stopped by user',
      },
    })
  }

  /**
   * Send a user message (initial prompt or follow-up)
   */
  send(content: string, images?: ImageAttachment[]): void {
    this.sendRaw({
      type: 'user',
      message: { role: 'user', content: buildUserContent(content, images) },
    })
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    requestId: string,
    behavior: 'allow' | 'deny',
    options: PermissionResponseOptions = {}
  ): void {
    const response =
      behavior === 'allow'
        ? { behavior: 'allow' as const, updatedInput: options.updatedInput ?? {} }
        : { behavior: 'deny' as const, message: options.message ?? 'User rejected this action' }

    this.sendRaw({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response,
      },
    })
  }

  /**
   * Send raw message to Claude's stdin
   */
  sendRaw(message: ClaudeInputEvent): void {
    if (!this.process?.isRunning) {
      throw new Error('Claude process not running')
    }
    this.process.writeLine(JSON.stringify(message))
  }

  private buildArgs(options: StartOptions): string[] {
    const args: string[] = [
      '--output-format',
      'stream-json', // Stream JSON events as they occur
      '--input-format',
      'stream-json', // Accept JSON input via stdin (incompatible with -p auto-exit)
      '--permission-prompt-tool',
      'stdio', // Route permission requests to stdin/stdout
      '--verbose', // Enable verbose output
    ]

    // Disabled: no turn limit by default. See #302 for potential future re-integration as a user setting.
    if (options.maxTurns !== undefined) {
      args.push('--max-turns', String(options.maxTurns))
    }

    // Pre-approve tools at the subprocess level to avoid permission round-trips
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', ...options.allowedTools)
    }

    if (
      typeof options.resumeSessionId === 'string' &&
      options.resumeSessionId.trim().length > 0
    ) {
      args.push('--resume', options.resumeSessionId.trim())
    }

    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      args.push('--model', options.model.trim())
    }

    // Set permission mode (e.g. 'plan' forces plan-first workflow)
    if (options.permissionMode && options.permissionMode !== 'default') {
      args.push('--permission-mode', options.permissionMode)
    }

    // Append to Claude Code's built-in system prompt (does NOT replace it)
    if (typeof options.systemPrompt === 'string' && options.systemPrompt.trim().length > 0) {
      args.push('--append-system-prompt', options.systemPrompt.trim())
    }

    args.push(...this.options.extraArgs)

    return args
  }

  private handleMessage(msg: ParsedClaudeMessage): void {
    const event = msg.data
    this.emitEvent(this.createRawEvent(event, 'cli_pre_normalization'))
    for (const normalizedEvent of this.normalizeEvent(event)) {
      this.emitEvent(normalizedEvent)
    }
  }

  private normalizeEvent(event: ClaudeEvent): AgentEvent[] {
    this.updateBackendSessionId(event)

    switch (event.type) {
      case 'assistant':
        return this.normalizeAssistantMessage(event)

      case 'user':
        return this.normalizeUserMessage(event)

      case 'control_request':
        return [
          {
            type: 'permission_request',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp: Date.now(),
            requestId: event.request_id,
            toolName: event.request.tool_name,
            toolUseId: event.request.tool_use_id,
            input: event.request.input,
            raw: event,
          },
        ]

      case 'result':
        return this.normalizeResult(event)

      case 'process_exit':
        this.process = null
        const shouldEmitComplete =
          this.getLifecycleState() !== 'stopping'
          && this.getLifecycleState() !== 'stopped'
        if (shouldEmitComplete) {
          this.stopping('process_exit')
        }
        this.stopped({
          reason: 'process_exit',
          complete: shouldEmitComplete
            ? {
                reason: 'process_exit',
                sessionId: this.getBackendSessionId(),
                exitCode: event.code,
                success: event.code === 0,
                ...(event.code === 0 ? {} : { errorMessage: this.formatExitError(event.code) }),
                raw: event,
              }
            : null,
        })
        return []

      case 'error':
        return [this.createErrorEvent(event.message, undefined, event)]

      case 'system':
        return [this.createRawEvent(event, event.subtype)]

      default:
        return [this.createRawEvent(event, event.type)]
    }
  }

  private normalizeAssistantMessage(event: ClaudeAssistantMessage): AgentEvent[] {
    const normalized: AgentEvent[] = []

    for (const block of event.message.content) {
      const mappedEvent = this.mapAssistantBlock(block)
      if (mappedEvent) {
        normalized.push(mappedEvent)
      }
    }

    if (normalized.length === 0) {
      normalized.push(this.createRawEvent(event, 'assistant'))
    }

    return normalized
  }

  private normalizeUserMessage(event: ClaudeUserMessage): AgentEvent[] {
    const content = event.message.content
    if (!Array.isArray(content)) {
      return [this.createRawEvent(event, 'user')]
    }

    const normalized: AgentEvent[] = []
    for (const block of content as ClaudeContentBlock[]) {
      const mappedEvent = this.mapAssistantBlock(block)
      if (mappedEvent) {
        normalized.push(mappedEvent)
      }
    }

    return normalized
  }

  private mapAssistantBlock(block: ClaudeContentBlock): AgentEvent | null {
    const timestamp = Date.now()

    switch (block.type) {
      case 'text':
        if (!block.text.trim()) {
          return null
        }
        return {
          type: 'message',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp,
          role: 'assistant',
          content: block.text,
          raw: block,
        }

      case 'tool_use':
        return {
          type: 'tool_use',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp,
          id: block.id,
          name: block.name,
          input: block.input,
          raw: block,
        }

      case 'tool_result':
        return {
          type: 'tool_result',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp,
          toolUseId: block.tool_use_id,
          content: block.content,
          ...(block.is_error ? { isError: true } : {}),
          raw: block,
        }

      case 'thinking':
        return this.createRawEvent(block, 'thinking')

      default:
        return this.createRawEvent(block, 'assistant_block')
    }
  }

  private normalizeResult(event: ClaudeResultMessage): AgentEvent[] {
    this.setBackendSessionId(event.session_id)
    if (this.skipResultEvents) {
      return []
    }
    const events: AgentEvent[] = []
    const isSuccess = event.subtype === 'success' && !event.is_error
    const errorMessage = isSuccess ? undefined : this.getResultErrorMessage(event)
    const resumeFailed = !isSuccess && this.isResumeFailure(errorMessage)
    let emittedMessageFromResult = false

    if (!this.hasEmittedAssistantMessage && isSuccess && 'result' in event && typeof event.result === 'string' && event.result.trim()) {
      emittedMessageFromResult = true
      events.push({
        type: 'message',
        eventId: crypto.randomUUID(),
        backend: this.name,
        timestamp: Date.now(),
        role: 'assistant',
        content: event.result,
        raw: event,
      })
    }

    if (!this.hasEmittedAssistantMessage && !emittedMessageFromResult && isSuccess && 'result' in event && Array.isArray(event.result)) {
      const textParts: string[] = []
      for (const block of event.result) {
        if (typeof block === 'object' && block !== null && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          textParts.push(block.text)
        }
      }
      const combined = textParts.join('\n')
      if (combined.trim()) {
        emittedMessageFromResult = true
        events.push({
          type: 'message',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          role: 'assistant',
          content: combined,
          raw: event,
        })
      }
    }

    events.push({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      reason: 'result',
      sessionId: event.session_id,
      success: isSuccess,
      errorMessage,
      ...(resumeFailed ? { resumeFailed } : {}),
      raw: event,
    })

    if (isSuccess && !this.hasEmittedAssistantMessage && !emittedMessageFromResult) {
      const resultField = 'result' in event ? event.result : undefined
      logger.warn('Session completed successfully with no assistant message', {
        sessionId: event.session_id,
        resultType: typeof resultField,
        resultLength: typeof resultField === 'string' ? resultField.length : undefined,
        resultIsArray: Array.isArray(resultField),
        numTurns: event.num_turns,
      })
    }

    if (!isSuccess) {
      events.push(this.createErrorEvent(errorMessage!, undefined, event))
    }

    return events
  }

  private getResultErrorMessage(event: ClaudeResultMessage): string {
    if ('errors' in event && event.errors.length > 0) {
      return event.errors.join('; ')
    }
    if ('result' in event && typeof event.result === 'string' && event.result.trim()) {
      const trimmed = event.result.trim()
      return trimmed.length > 500 ? trimmed.slice(0, 500) + '…' : trimmed
    }
    return event.is_error
      ? `Claude run failed (subtype: ${event.subtype})`
      : `Claude run ended with ${event.subtype}`
  }

  private updateBackendSessionId(event: ClaudeEvent): void {
    if ('session_id' in event && typeof event.session_id === 'string') {
      this.setBackendSessionId(event.session_id)
    }
  }

  private isResumeFailure(errorMessage: string | undefined): boolean {
    if (!errorMessage) return false
    const lower = errorMessage.toLowerCase()
    return /\bsession(?:[\s_-]*id)?\b.*\bdoes not exist\b/.test(lower) ||
      /\bsession(?:[\s_-]*id)?\b.*\bnot found\b/.test(lower) ||
      lower.includes('no such session') ||
      /\binvalid session(?:[\s_-]*id)?\b/.test(lower) ||
      /\bunknown session(?:[\s_-]*id)?\b/.test(lower)
  }

  private formatExitError(code: number | null): string {
    const base = `Claude process exited with code ${code}`
    const stderr = this.stderrBuffer.join('').trim()
    if (!stderr) return base
    const truncated = stderr.length > 500 ? stderr.slice(-500) : stderr
    return `${base}\n${truncated}`
  }

  private createRawEvent(data: unknown, sourceType?: string): AgentEvent {
    return {
      type: 'raw',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      sourceType,
      data,
    }
  }

  private createErrorEvent(message: string, error?: Error, raw?: unknown): AgentEvent {
    return {
      type: 'error',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      message,
      error,
      raw,
    }
  }
}
