import {
  BACKEND_TYPES,
  type AgentEvent,
  type ImageAttachment,
  type PermissionResponseOptions,
  type StartOptions,
} from '../../types'
import { Process, waitForRunning } from '../../utils'
import { BaseAgentBackend } from '../base-agent-backend'
import { createCleanEnv, createJsonRpcLineBehavior, resolveCodexPath } from './utils'
import type {
  CodexCommandApprovalParams,
  CodexCommandApprovalResponse,
  CodexErrorNotificationParams,
  CodexFileChangeApprovalParams,
  CodexFileChangeApprovalResponse,
  CodexItemNotificationParams,
  CodexInitializeParams,
  CodexInitializeResponse,
  CodexModelListParams,
  CodexModelListResult,
  CodexThreadItemAgentMessage,
  CodexThreadItemCommandExecution,
  CodexThreadItemFileChange,
  CodexThreadItemMcpToolCall,
  CodexThreadResumeParams,
  CodexThreadResumeResponse,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurn,
  CodexTurnCompletedNotificationParams,
  CodexTurnStartParams,
  CodexTurnStartResponse,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types'

export interface CodexBackendOptions {
  /** Path to the codex CLI executable (default: auto-resolved) */
  cliPath?: string
  /** Additional CLI arguments appended after `codex app-server` */
  extraArgs?: string[]
  /** JSON-RPC request timeout in milliseconds (default: 30000) */
  requestTimeoutMs?: number
}

interface PendingRequest {
  method: string
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface PendingApprovalRequest {
  rpcId: JsonRpcId
  method:
    | 'item/commandExecution/requestApproval'
    | 'item/fileChange/requestApproval'
}

const NOISY_NOTIFICATION_METHODS = new Set<string>([
  'thread/tokenUsage/updated',
  'account/rateLimits/updated',
  'codex/event/token_count',
  'codex/event/mcp_startup_update',
  'codex/event/mcp_startup_complete',
  'codex/event/item_started',
  'codex/event/item_completed',
  'codex/event/task_started',
  'codex/event/user_message',
])

/**
 * Agent backend that runs Codex app-server over stdio JSON-RPC transport.
 */
export class CodexBackend extends BaseAgentBackend {
  readonly name = BACKEND_TYPES.CODEX

  private activeTurnId: string | undefined
  private process: Process | null = null
  private skipTurnCompletionEvents = false
  private options: Required<CodexBackendOptions>
  private nextRequestId = 1
  private pendingRequests = new Map<string, PendingRequest>()
  private pendingApprovalRequests = new Map<string, PendingApprovalRequest>()
  private agentMessageBuffers = new Map<string, string>()
  private emittedAgentMessageItemIds = new Set<string>()
  private recentAssistantMessages: Array<{ content: string; timestamp: number }> = []

  constructor(options: CodexBackendOptions = {}) {
    super()
    this.options = {
      cliPath: options.cliPath ?? resolveCodexPath(),
      extraArgs: options.extraArgs ?? [],
      requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
    }
  }

  async start(options: StartOptions): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Codex backend is already running')
    }

    this.starting()
    this.clearBackendSessionId()
    this.activeTurnId = undefined
    this.skipTurnCompletionEvents = false

    const args = this.buildArgs()
    const jsonRpcBehavior = createJsonRpcLineBehavior({
      onMessage: (message) => this.handleJsonRpcMessage(message),
      onParseError: (line, _error) => {
        this.emitRawIfDebug({ line }, 'stdout_non_json')
      },
    })

    this.process = new Process(
      {
        command: this.options.cliPath,
        args,
        cwd: options.projectPath,
        env: createCleanEnv(),
        inheritEnv: false,
        name: 'codex-app-server',
      },
      {
        onSpawn: (pid) => {
          this.emitRawIfDebug({ pid }, 'process_spawn')
        },
        onStderr: (data) => {
          this.emitRawIfDebug({ stderr: data }, 'process_stderr')
        },
        onExit: (code, signal) => {
          this.process = null
          this.activeTurnId = undefined
          this.rejectAllPendingRequests(
            new Error(`Codex process exited (code=${code}, signal=${signal ?? 'none'})`)
          )

          const lifecycleState = this.getLifecycleState()
          const wasStopping = lifecycleState === 'stopping' || lifecycleState === 'stopped'
          if (!wasStopping) {
            this.stopping('process_exit')
          }
          this.stopped({
            reason: 'process_exit',
            complete: wasStopping
              ? null
              : {
                  reason: 'process_exit',
                  sessionId: this.getBackendSessionId(),
                  exitCode: code,
                  success: code === 0,
                  ...(code === 0 ? {} : { errorMessage: `Codex process exited with code ${code}` }),
                },
          })
        },
        onError: (error) => {
          this.process = null
          this.activeTurnId = undefined
          this.failed(error.message, {
            reason: 'process_error',
            error,
          })
        },
      },
      [jsonRpcBehavior]
    )

    try {
      await this.process.spawn()
      await waitForRunning(this.process)

      await this.initialize()
      this.sendNotification('initialized')
      await this.startOrResumeThread(options)
      this.started()
      await this.startTurn(
        options.initialMessage || 'Message Error: No initial prompt provided.'
      )
    } catch (error) {
      this.activeTurnId = undefined
      this.rejectAllPendingRequests(
        error instanceof Error ? error : new Error(String(error))
      )

      if (this.process?.isRunning) {
        this.process.kill('SIGTERM')
      }
      this.process = null

      if (this.getLifecycleState() !== 'failed' && this.getLifecycleState() !== 'stopped') {
        const err = error instanceof Error ? error : new Error(String(error))
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
    this.skipTurnCompletionEvents = true

    const threadId = this.getBackendSessionId()
    const turnId = this.activeTurnId

    if (threadId && turnId) {
      await this.sendRequest<Record<string, never>>('turn/interrupt', {
        threadId,
        turnId,
      }).catch(() => {
        // Best effort interrupt before kill.
      })
    }

    if (this.process?.isRunning) {
      this.process.kill('SIGTERM')
    }

    this.process = null
    this.activeTurnId = undefined
    this.rejectAllPendingRequests(new Error('Codex backend stopped'))
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

  send(message: string, _images?: ImageAttachment[]): void {
    if (!this.isRunning()) {
      throw new Error('Codex backend is not running')
    }

    void this.startTurn(message).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emitEvent(this.createErrorEvent(err.message, err))
    })
  }

  respondToPermission(
    requestId: string,
    behavior: 'allow' | 'deny',
    _options: PermissionResponseOptions = {}
  ): void {
    const pending = this.pendingApprovalRequests.get(requestId)
    if (!pending) {
      throw new Error(`Unknown Codex permission request: ${requestId}`)
    }

    const decision = behavior === 'allow' ? 'accept' : 'decline'

    if (pending.method === 'item/commandExecution/requestApproval') {
      const response: CodexCommandApprovalResponse = { decision }
      this.sendResponse(pending.rpcId, response)
    } else {
      const response: CodexFileChangeApprovalResponse = { decision }
      this.sendResponse(pending.rpcId, response)
    }

    this.pendingApprovalRequests.delete(requestId)
  }

  async listModels(): Promise<CodexModelListResult> {
    return this.sendRequest<CodexModelListResult>('model/list', { limit: 100 } satisfies CodexModelListParams)
  }

  async spawnAndInitialize(projectPath: string): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Codex backend is already running')
    }

    this.starting()
    this.clearBackendSessionId()

    const args = this.buildArgs()
    const jsonRpcBehavior = createJsonRpcLineBehavior({
      onMessage: (message) => this.handleJsonRpcMessage(message),
      onParseError: () => {},
    })

    this.process = new Process(
      {
        command: this.options.cliPath,
        args,
        cwd: projectPath,
        env: createCleanEnv(),
        inheritEnv: false,
        name: 'codex-app-server',
      },
      {
        onSpawn: () => {},
        onStderr: () => {},
        onExit: (_code, _signal) => {
          this.process = null
          this.rejectAllPendingRequests(new Error('Codex process exited'))
          const lifecycleState = this.getLifecycleState()
          if (lifecycleState !== 'stopping' && lifecycleState !== 'stopped') {
            this.stopping('process_exit')
          }
          this.stopped({ reason: 'process_exit', complete: null })
        },
        onError: (error) => {
          this.process = null
          this.failed(error.message, { reason: 'process_error', error })
        },
      },
      [jsonRpcBehavior]
    )

    try {
      await this.process.spawn()
      await waitForRunning(this.process)
      await this.initialize()
      this.sendNotification('initialized')
      this.started()
    } catch (error) {
      this.rejectAllPendingRequests(
        error instanceof Error ? error : new Error(String(error))
      )
      if (this.process?.isRunning) {
        this.process.kill('SIGTERM')
      }
      this.process = null
      if (this.getLifecycleState() !== 'failed' && this.getLifecycleState() !== 'stopped') {
        const err = error instanceof Error ? error : new Error(String(error))
        this.failed(err.message, { reason: 'start_failed', error: err })
      }
      throw error
    }
  }

  private buildArgs(): string[] {
    return ['app-server', '--listen', 'stdio://', ...this.options.extraArgs]
  }

  private async initialize(): Promise<void> {
    const params: CodexInitializeParams = {
      clientInfo: {
        name: 'kombuse',
        title: 'Kombuse',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: false,
      },
    }

    await this.sendRequest<CodexInitializeResponse>('initialize', params)
  }

  private async startOrResumeThread(options: StartOptions): Promise<void> {
    const systemPrompt = this.normalizeSystemPrompt(options.systemPrompt)
    const model = typeof options.model === 'string' && options.model.trim().length > 0
      ? options.model.trim()
      : undefined

    if (options.resumeSessionId && options.resumeSessionId.trim().length > 0) {
      const params: CodexThreadResumeParams = {
        threadId: options.resumeSessionId.trim(),
        cwd: options.projectPath,
        ...(model ? { model } : {}),
        ...(systemPrompt ? { developerInstructions: systemPrompt } : {}),
      }
      const response = await this.sendRequest<CodexThreadResumeResponse>(
        'thread/resume',
        params
      )
      this.setBackendSessionId(response.thread.id)
      this.emitThreadCreatedEvent(response.thread.id)
      return
    }

    const params: CodexThreadStartParams = {
      cwd: options.projectPath,
      experimentalRawEvents: false,
      ...(model ? { model } : {}),
      ...(systemPrompt ? { developerInstructions: systemPrompt } : {}),
    }
    const response = await this.sendRequest<CodexThreadStartResponse>('thread/start', params)
    this.setBackendSessionId(response.thread.id)
    this.emitThreadCreatedEvent(response.thread.id)
  }

  private async startTurn(content: string): Promise<void> {
    const threadId = this.getBackendSessionId()
    if (!threadId) {
      throw new Error('Codex thread is not initialized')
    }

    const params: CodexTurnStartParams = {
      threadId,
      input: [
        {
          type: 'text',
          text: content,
          text_elements: [],
        },
      ],
    }

    const response = await this.sendRequest<CodexTurnStartResponse>('turn/start', params)
    this.activeTurnId = response.turn.id
  }

  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.isRunning) {
      throw new Error('Codex process not running')
    }

    const id = this.nextRequestId++
    const payload: JsonRpcRequest = {
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(String(id))
        reject(new Error(`Codex request timed out: ${method}`))
      }, this.options.requestTimeoutMs)
      if (timeout.unref) {
        timeout.unref()
      }

      this.pendingRequests.set(String(id), {
        method,
        resolve: (result) => resolve(result as T),
        reject,
        timeout,
      })

      try {
        this.process?.writeLine(JSON.stringify(payload))
      } catch (error) {
        clearTimeout(timeout)
        this.pendingRequests.delete(String(id))
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private sendNotification(method: string, params?: unknown): void {
    const payload = {
      method,
      ...(params !== undefined ? { params } : {}),
    }
    this.writeMessage(payload)
  }

  private sendResponse(id: JsonRpcId, result: unknown): void {
    this.writeMessage({ id, result })
  }

  private sendErrorResponse(id: JsonRpcId, code: number, message: string): void {
    this.writeMessage({
      id,
      error: {
        code,
        message,
      },
    })
  }

  private writeMessage(payload: unknown): void {
    if (!this.process?.isRunning) {
      throw new Error('Codex process not running')
    }
    this.process.writeLine(JSON.stringify(payload))
  }

  private rejectAllPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private handleJsonRpcMessage(message: JsonRpcMessage): void {
    if (this.isRpcResponse(message)) {
      this.handleRpcResponse(message)
      return
    }

    if (this.isRpcRequest(message)) {
      this.handleRpcRequest(message)
      return
    }

    if (this.isRpcNotification(message)) {
      this.handleRpcNotification(message)
      return
    }

    this.emitRawIfDebug(message, 'rpc_unknown_message')
  }

  private handleRpcResponse(message: JsonRpcResponse): void {
    const key = String(message.id)
    const pending = this.pendingRequests.get(key)

    if (!pending) {
      this.emitRawIfDebug(message, 'rpc_unmatched_response')
      return
    }

    this.pendingRequests.delete(key)
    clearTimeout(pending.timeout)

    if ('error' in message) {
      pending.reject(
        new Error(`${pending.method} failed (${message.error.code}): ${message.error.message}`)
      )
      return
    }

    pending.resolve(message.result)
  }

  private handleRpcRequest(message: JsonRpcRequest): void {
    if (message.method === 'item/commandExecution/requestApproval') {
      const params = message.params as CodexCommandApprovalParams
      const requestId = String(message.id)

      this.pendingApprovalRequests.set(requestId, {
        rpcId: message.id,
        method: message.method,
      })

      this.emitEvent({
        type: 'permission_request',
        eventId: crypto.randomUUID(),
        backend: this.name,
        timestamp: Date.now(),
        requestId,
        toolName: 'Bash',
        toolUseId: params.itemId,
        input: {
          command: params.command ?? undefined,
          cwd: params.cwd ?? undefined,
          reason: params.reason ?? undefined,
          commandActions: params.commandActions ?? undefined,
          threadId: params.threadId,
          turnId: params.turnId,
        },
        raw: message,
      })
      return
    }

    if (message.method === 'item/fileChange/requestApproval') {
      const params = message.params as CodexFileChangeApprovalParams
      const requestId = String(message.id)

      this.pendingApprovalRequests.set(requestId, {
        rpcId: message.id,
        method: message.method,
      })

      this.emitEvent({
        type: 'permission_request',
        eventId: crypto.randomUUID(),
        backend: this.name,
        timestamp: Date.now(),
        requestId,
        toolName: 'Write',
        toolUseId: params.itemId,
        input: {
          grantRoot: params.grantRoot ?? undefined,
          reason: params.reason ?? undefined,
        },
        raw: message,
      })
      return
    }

    this.sendErrorResponse(message.id, -32601, `Unsupported Codex server request: ${message.method}`)
    this.emitRawIfDebug(message, 'rpc_unsupported_server_request')
  }

  private handleRpcNotification(message: { method: string; params?: unknown }): void {
    switch (message.method) {
      case 'thread/started': {
        const params = message.params as { thread?: { id?: string } }
        const threadId = params.thread?.id
        if (threadId) {
          this.setBackendSessionId(threadId)
        }
        return
      }

      case 'turn/started': {
        const params = message.params as { turn?: { id?: string }; threadId?: string }
        const threadId = params.threadId
        const turnId = params.turn?.id
        if (threadId) {
          this.setBackendSessionId(threadId)
        }
        if (turnId) {
          this.activeTurnId = turnId
        }
        return
      }

      case 'item/started': {
        const params = message.params as CodexItemNotificationParams
        if (params.threadId) {
          this.setBackendSessionId(params.threadId)
        }
        const events = this.mapItemStarted(params)
        for (const event of events) {
          this.emitEvent(event)
        }
        return
      }

      case 'item/completed': {
        const params = message.params as CodexItemNotificationParams
        if (params.threadId) {
          this.setBackendSessionId(params.threadId)
        }
        const events = this.mapItemCompleted(params)
        for (const event of events) {
          this.emitEvent(event)
        }
        return
      }

      case 'item/agentMessage/delta': {
        this.handleAgentMessageDelta(message.params)
        return
      }

      case 'codex/event/agent_message_delta':
      case 'codex/event/agent_message_content_delta': {
        this.handleAgentMessageDelta(message.params)
        return
      }

      case 'codex/event/agent_message': {
        this.handleLegacyAgentMessage(message.params)
        return
      }

      case 'codex/event/task_complete': {
        this.flushBufferedAgentMessages(message)
        return
      }

      case 'turn/completed': {
        const params = message.params as CodexTurnCompletedNotificationParams
        this.handleTurnCompleted(params)
        return
      }

      case 'error': {
        const params = message.params as CodexErrorNotificationParams
        const errorMessage = params.error.additionalDetails
          ? `${params.error.message}: ${params.error.additionalDetails}`
          : params.error.message

        this.emitEvent(
          this.createErrorEvent(errorMessage || 'Codex error notification received', undefined, message)
        )
        return
      }

      case 'codex/event/item_started':
      case 'codex/event/item_completed':
      case 'codex/event/task_started':
      case 'codex/event/user_message':
      case 'codex/event/token_count':
      case 'thread/tokenUsage/updated':
      case 'account/rateLimits/updated':
      case 'codex/event/mcp_startup_update':
      case 'codex/event/mcp_startup_complete':
        return

      default:
        if (NOISY_NOTIFICATION_METHODS.has(message.method)) {
          return
        }
        this.emitRawIfDebug(message, message.method)
    }
  }

  private handleTurnCompleted(params: CodexTurnCompletedNotificationParams): void {
    this.setBackendSessionId(params.threadId)
    this.activeTurnId = undefined

    this.flushBufferedAgentMessages({ method: 'turn/completed', params })

    if (this.skipTurnCompletionEvents) {
      return
    }

    const turn = params.turn
    const success = turn.status === 'completed'
    const errorMessage = success ? undefined : this.getTurnErrorMessage(turn)

    if (!success) {
      this.emitEvent(
        this.createErrorEvent(
          errorMessage ?? 'Codex turn failed',
          undefined,
          { method: 'turn/completed', params }
        )
      )
    }

    this.emitComplete({
      reason: 'result',
      sessionId: this.getBackendSessionId(),
      success,
      ...(errorMessage ? { errorMessage } : {}),
      raw: { method: 'turn/completed', params },
    })
  }

  private mapItemStarted(params: CodexItemNotificationParams): AgentEvent[] {
    const { item } = params
    const timestamp = Date.now()

    switch (item.type) {
      case 'commandExecution': {
        const command = item as CodexThreadItemCommandExecution
        return [
          {
            type: 'tool_use',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            id: command.id,
            name: 'Bash',
            input: {
              command: command.command,
              cwd: command.cwd,
              commandActions: command.commandActions ?? [],
            },
            raw: params,
          },
        ]
      }

      case 'fileChange': {
        const fileChange = item as CodexThreadItemFileChange
        return [
          {
            type: 'tool_use',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            id: fileChange.id,
            name: 'Write',
            input: {
              changes: fileChange.changes ?? [],
            },
            raw: params,
          },
        ]
      }

      case 'mcpToolCall': {
        const mcpToolCall = item as CodexThreadItemMcpToolCall
        return [
          {
            type: 'tool_use',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            id: mcpToolCall.id,
            name: this.normalizeMcpToolName(mcpToolCall.server, mcpToolCall.tool),
            input: this.normalizeUnknownRecord(mcpToolCall.arguments),
            raw: params,
          },
        ]
      }

      case 'agentMessage':
      case 'userMessage':
        return []

      default:
        return this.createRawEventsIfDebug(params, `item_started:${item.type}`)
    }
  }

  private mapItemCompleted(params: CodexItemNotificationParams): AgentEvent[] {
    const { item } = params
    const timestamp = Date.now()

    switch (item.type) {
      case 'agentMessage': {
        const agentMessage = item as CodexThreadItemAgentMessage
        const bufferedText = this.agentMessageBuffers.get(agentMessage.id)
        this.agentMessageBuffers.delete(agentMessage.id)

        const text = agentMessage.text.trim() || bufferedText?.trim() || ''
        const messageEvent = this.createAssistantMessageEvent(text, params, agentMessage.id)
        if (!messageEvent) {
          return []
        }

        return [messageEvent]
      }

      case 'commandExecution': {
        const command = item as CodexThreadItemCommandExecution
        const content = command.aggregatedOutput?.trim()
          ? command.aggregatedOutput
          : command.exitCode != null
            ? `Command exited with code ${command.exitCode}`
            : `Command ${command.status}`

        const isError =
          command.status === 'failed'
          || command.status === 'declined'
          || (typeof command.exitCode === 'number' && command.exitCode !== 0)

        return [
          {
            type: 'tool_result',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            toolUseId: command.id,
            content,
            ...(isError ? { isError: true } : {}),
            raw: params,
          },
        ]
      }

      case 'fileChange': {
        const fileChange = item as CodexThreadItemFileChange
        const changeCount = Array.isArray(fileChange.changes) ? fileChange.changes.length : 0
        const content = changeCount > 0
          ? `Applied ${changeCount} file change${changeCount === 1 ? '' : 's'}`
          : `File change ${fileChange.status}`
        const isError = fileChange.status === 'failed' || fileChange.status === 'declined'

        return [
          {
            type: 'tool_result',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            toolUseId: fileChange.id,
            content,
            ...(isError ? { isError: true } : {}),
            raw: params,
          },
        ]
      }

      case 'mcpToolCall': {
        const mcpToolCall = item as CodexThreadItemMcpToolCall
        const content = this.normalizeMcpResultContent(mcpToolCall)
        const isError = mcpToolCall.status === 'failed'

        return [
          {
            type: 'tool_result',
            eventId: crypto.randomUUID(),
            backend: this.name,
            timestamp,
            toolUseId: mcpToolCall.id,
            content,
            ...(isError ? { isError: true } : {}),
            raw: params,
          },
        ]
      }

      case 'userMessage':
        return []

      default:
        return this.createRawEventsIfDebug(params, `item_completed:${item.type}`)
    }
  }

  private normalizeMcpResultContent(item: CodexThreadItemMcpToolCall): string | unknown[] {
    if (item.error?.message) {
      return item.error.message
    }

    if (Array.isArray(item.result?.content)) {
      return item.result.content
    }

    if (item.result?.structuredContent !== undefined && item.result?.structuredContent !== null) {
      return [item.result.structuredContent]
    }

    return `MCP tool ${item.status}`
  }

  private normalizeMcpToolName(server: string, tool: string): string {
    if (tool.startsWith('mcp__')) {
      return tool
    }
    return `mcp__${server}__${tool}`
  }

  private normalizeUnknownRecord(input: unknown): Record<string, unknown> {
    if (this.isRecord(input)) {
      return input
    }
    return { value: input }
  }

  private handleAgentMessageDelta(params: unknown): void {
    const parsed = this.parseAgentMessageDelta(params)
    if (!parsed?.delta) {
      return
    }

    if (parsed.threadId) {
      this.setBackendSessionId(parsed.threadId)
    }
    if (parsed.turnId) {
      this.activeTurnId = parsed.turnId
    }

    const key = parsed.itemId ?? (parsed.turnId ? `turn:${parsed.turnId}` : 'turn:unknown')
    this.agentMessageBuffers.set(key, (this.agentMessageBuffers.get(key) ?? '') + parsed.delta)
  }

  private flushBufferedAgentMessages(raw: unknown): void {
    if (this.agentMessageBuffers.size === 0) {
      return
    }

    for (const [key, text] of this.agentMessageBuffers) {
      const itemId = key.startsWith('turn:') ? undefined : key
      const messageEvent = this.createAssistantMessageEvent(text, {
        source: 'item/agentMessage/delta',
        key,
        upstream: raw,
      }, itemId)
      if (!messageEvent) {
        continue
      }

      this.emitEvent(messageEvent)
    }

    this.agentMessageBuffers.clear()
  }

  private handleLegacyAgentMessage(params: unknown): void {
    if (!this.isRecord(params)) {
      return
    }

    const envelopeMsg = this.isRecord(params.msg) ? params.msg : undefined
    const source = envelopeMsg ?? params
    const content =
      this.readString(source, 'message')
      ?? this.readString(source, 'text')
      ?? ''
    const itemId = this.readString(source, 'itemId', 'item_id', 'id')

    const messageEvent = this.createAssistantMessageEvent(content, params, itemId)
    if (!messageEvent) {
      return
    }

    this.emitEvent(messageEvent)
  }

  private createAssistantMessageEvent(
    content: string,
    raw: unknown,
    itemId?: string
  ): AgentEvent | null {
    const normalized = content.trim()
    if (!normalized) {
      return null
    }
    const dedupeKey = normalized.replace(/\s+/g, ' ')

    const now = Date.now()
    this.recentAssistantMessages = this.recentAssistantMessages.filter(
      (entry) => now - entry.timestamp < 10_000
    )

    if (itemId && this.emittedAgentMessageItemIds.has(itemId)) {
      return null
    }

    const isRecentDuplicate = this.recentAssistantMessages.some(
      (entry) => entry.content === dedupeKey && now - entry.timestamp < 4_000
    )
    if (isRecentDuplicate) {
      return null
    }

    this.recentAssistantMessages.push({ content: dedupeKey, timestamp: now })
    if (itemId) {
      this.emittedAgentMessageItemIds.add(itemId)
    }

    return {
      type: 'message',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: now,
      role: 'assistant',
      content: normalized,
      raw,
    }
  }

  private parseAgentMessageDelta(params: unknown): {
    threadId?: string
    turnId?: string
    itemId?: string
    delta: string
  } | null {
    if (!this.isRecord(params)) {
      return null
    }

    const envelopeMsg = this.isRecord(params.msg) ? params.msg : undefined
    const source = envelopeMsg ?? params

    const threadId =
      this.readString(source, 'threadId', 'thread_id')
      ?? this.readString(params, 'conversationId')
    const turnId = this.readString(source, 'turnId', 'turn_id')
    const itemId = this.readString(source, 'itemId', 'item_id')
    const delta = this.readString(source, 'delta') ?? ''

    return { threadId, turnId, itemId, delta }
  }

  private readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string') {
        return value
      }
    }
    return undefined
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private isRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
    return this.isRecord(message)
      && 'id' in message
      && 'method' in message
      && typeof message.method === 'string'
  }

  private isRpcNotification(message: JsonRpcMessage): message is { method: string; params?: unknown } {
    return this.isRecord(message)
      && 'method' in message
      && typeof message.method === 'string'
      && !('id' in message)
  }

  private isRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
    return this.isRecord(message)
      && 'id' in message
      && ('result' in message || 'error' in message)
      && !('method' in message)
  }

  private getTurnErrorMessage(turn: CodexTurn): string {
    if (turn.error?.additionalDetails) {
      return `${turn.error.message}: ${turn.error.additionalDetails}`
    }
    if (turn.error?.message) {
      return turn.error.message
    }

    switch (turn.status) {
      case 'failed':
        return 'Codex turn failed'
      case 'interrupted':
        return 'Codex turn interrupted'
      default:
        return `Codex turn ended with status ${turn.status}`
    }
  }

  private emitThreadCreatedEvent(threadId: string): void {
    this.emitEvent({
      type: 'raw',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      sourceType: 'thread_created',
      data: { session_id: threadId },
    })
  }

  private normalizeSystemPrompt(systemPrompt: string | undefined): string | undefined {
    if (typeof systemPrompt !== 'string') {
      return undefined
    }

    const trimmed = systemPrompt.trim()
    return trimmed.length > 0 ? trimmed : undefined
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

  private emitRawIfDebug(data: unknown, sourceType?: string): void {
    if (process.env.KOMBUSE_LOG_LEVEL === 'debug') {
      this.emitEvent(this.createRawEvent(data, sourceType))
    }
  }

  private createRawEventsIfDebug(data: unknown, sourceType?: string): AgentEvent[] {
    if (process.env.KOMBUSE_LOG_LEVEL === 'debug') {
      return [this.createRawEvent(data, sourceType)]
    }
    return []
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
