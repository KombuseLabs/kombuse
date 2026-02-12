import { BACKEND_TYPES, type AgentBackend, type AgentEvent, type StartOptions } from '../../types'
import { Process, waitForRunning } from '../../utils'
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

/**
 * Input events sent to Claude CLI via stdin
 */
export type ClaudeInputEvent =
  | { type: 'user'; message: { role: 'user'; content: string } }
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
 * Leverages existing CLI configuration (API keys, CLAUDE.md, MCP servers, etc.)
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly name = BACKEND_TYPES.CLAUDE_CODE

  private running = false
  private backendSessionId: string | undefined
  private subscribers = new Set<(event: AgentEvent) => void>()
  private process: Process | null = null
  private options: Required<ClaudeCodeOptions>

  constructor(options: ClaudeCodeOptions = {}) {
    this.options = {
      cliPath: options.cliPath ?? resolveClaudePath(),
      extraArgs: options.extraArgs ?? [],
      thinkingEnabled: options.thinkingEnabled ?? false,
    }
  }

  async start(options: StartOptions): Promise<void> {
    if (this.running) {
      throw new Error('Claude Code backend is already running')
    }

    this.running = true
    this.backendSessionId = undefined

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
          this.emit(this.createRawEvent({ pid }, 'process_spawn'))
        },
        onStderr: (data) => {
          this.emit(this.createRawEvent({ stderr: data }, 'process_stderr'))
        },
        onExit: (code, signal) => {
          this.running = false
        },
        onError: (error) => {
          this.running = false
          this.emit(this.createErrorEvent(error.message, error))
        },
      },
      [jsonLineBehavior]
    )

    try {
      await this.process.spawn()
      await waitForRunning(this.process)
      await this.sendRaw({
        type: 'user',
        message: {
          role: 'user',
          content: options.initialMessage || 'Message Error: No initial prompt provided.',
        },
      })
    } catch (error) {
      this.running = false
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.running || !this.process) {
      return
    }

    this.process.kill('SIGTERM')
    this.running = false
    this.process = null
  }

  /**
   * Send a user message (initial prompt or follow-up)
   */
  send(content: string): void {
    this.sendRaw({
      type: 'user',
      message: { role: 'user', content },
    })
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    requestId: string,
    behavior: 'allow' | 'deny',
    options: { updatedInput?: Record<string, unknown>; message?: string } = {}
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

  subscribe(handler: (event: AgentEvent) => void): () => void {
    this.subscribers.add(handler)
    return () => {
      this.subscribers.delete(handler)
    }
  }

  isRunning(): boolean {
    return this.running
  }

  getBackendSessionId(): string | undefined {
    return this.backendSessionId
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
      '--max-turns',
      String(options.maxTurns ?? 50),
    ]

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
    this.emit(this.createRawEvent(event, 'cli_pre_normalization'))
    for (const normalizedEvent of this.normalizeEvent(event)) {
      this.emit(normalizedEvent)
    }
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.subscribers) {
      try {
        handler(event)
      } catch {
        // Ignore subscriber errors to avoid crashing the backend.
      }
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
        this.running = false
        return [
          {
            type: 'complete',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp: Date.now(),
            reason: 'process_exit',
            sessionId: this.backendSessionId,
            exitCode: event.code,
            success: event.code === 0,
            raw: event,
          },
        ]

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
    this.backendSessionId = event.session_id
    const events: AgentEvent[] = []
    const isSuccess = event.subtype === 'success' && !event.is_error
    const errorMessage = isSuccess ? undefined : this.getResultErrorMessage(event)
    const resumeFailed = !isSuccess && this.isResumeFailure(errorMessage)

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

    if (!isSuccess) {
      events.push(this.createErrorEvent(errorMessage!, undefined, event))
    }

    return events
  }

  private getResultErrorMessage(event: ClaudeResultMessage): string {
    if ('errors' in event && event.errors.length > 0) {
      return event.errors.join('; ')
    }
    return `Claude run ended with ${event.subtype}`
  }

  private updateBackendSessionId(event: ClaudeEvent): void {
    if ('session_id' in event && typeof event.session_id === 'string') {
      this.backendSessionId = event.session_id
    }
  }

  private isResumeFailure(errorMessage: string | undefined): boolean {
    if (!errorMessage) return false
    const lower = errorMessage.toLowerCase()
    return lower.includes('session does not exist') ||
      lower.includes('session not found') ||
      lower.includes('no such session')
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
