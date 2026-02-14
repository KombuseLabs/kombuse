import { agentInvocationsRepository, commentsRepository, profilesRepository } from '@kombuse/persistence'
import { buildConversationSummary, renderTemplate } from '@kombuse/services'
import {
  BACKEND_TYPES,
  isValidSessionId,
  type AgentBackend,
  type AgentEvent,
  type ConversationContext,
  type KombuseSessionId,
  type PermissionMode,
  type ServerMessage,
  type SessionMetadata,
} from '@kombuse/types'
import { createSessionLogger } from '../../logger'
import { wsHub } from '../../websocket/hub'
import {
  normalizeModelPreference,
  readUserDefaultBackendType,
  readUserDefaultModelPreference,
  resolveBackendType,
  resolveConfiguredBackendType,
  resolveModelPreference,
} from '../session-preferences'
import { broadcastTicketAgentStatus, unregisterBackend } from './backend-registry'
import { broadcastPermissionPending } from './permission-service'
import { getTypePreset, presetToAllowedTools, shouldAutoApprove, type AgentTypePreset } from './presets'
import { activeBackends, setSessionTurnActive } from './runtime-state'
import type {
  AgentExecutionDependencies,
  AgentExecutionEvent,
  AgentInvokeMessage,
} from './types'

/**
 * Options for running an agent chat session
 */
interface ChatRunnerOptions {
  /** Project path for the agent to work in */
  projectPath: string
  /** Backend-native session ID to resume */
  resumeSessionId?: string
  /** System prompt override */
  systemPrompt?: string
  /** Tools to pre-approve at the subprocess level via --allowedTools */
  allowedTools?: string[]
  /** Permission mode for the CLI session (e.g. 'plan' forces plan-first workflow) */
  permissionMode?: PermissionMode
  /** Model to apply when backend supports explicit model selection. */
  model?: string
  /** Callback for each agent event */
  onEvent: (event: AgentEvent) => void
  /** Callback when complete, receives backend session context if available */
  onComplete?: (context: ConversationContext) => void
  /** Callback when the backend was explicitly stopped */
  onStopped?: (reason: string) => void
  /** Callback on error */
  onError?: (error: Error) => void
  /** Callback when resume fails (e.g. "session does not exist") — allows retry without --resume */
  onResumeFailed?: () => void
}

/**
 * Run a chat message through an agent backend.
 * Returns immediately after starting - events come via callbacks.
 */
async function runAgentChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: KombuseSessionId,
  options: ChatRunnerOptions
): Promise<ConversationContext> {
  const appSessionId = kombuseSessionId
  let didComplete = false

  const finalize = (keepAlive = false) => {
    unsubscribe()
    if (!keepAlive && backend.isRunning()) {
      void backend.stop().catch((stopError) => {
        options.onError?.(
          stopError instanceof Error ? stopError : new Error(String(stopError))
        )
      })
    }
  }

  const unsubscribe = backend.subscribe((event) => {
    if (didComplete) {
      return
    }

    if (event.type === 'complete') {
      didComplete = true
      if (event.resumeFailed && options.onResumeFailed) {
        finalize()
        options.onResumeFailed()
        return
      }
      if (event.reason === 'stopped') {
        options.onStopped?.('user_stop')
        finalize()
        return
      }
      if (event.success === false) {
        const msg = event.errorMessage
          ?? (event.exitCode != null
            ? `Process exited with code ${event.exitCode}`
            : `Agent run failed (${event.reason})`)
        options.onError?.(new Error(msg))
        finalize()
      } else {
        const backendSessionId = backend.getBackendSessionId()
        const context: ConversationContext = {
          kombuseSessionId: appSessionId,
          backendSessionId,
        }
        options.onComplete?.(context)
        finalize(true)
      }
    } else if (event.type === 'lifecycle') {
      return
    } else {
      options.onEvent(event)
    }
  })

  await backend.start({
    kombuseSessionId: appSessionId,
    resumeSessionId: options.resumeSessionId,
    model: options.model,
    projectPath: options.projectPath,
    systemPrompt: options.systemPrompt,
    allowedTools: options.allowedTools,
    permissionMode: options.permissionMode,
    initialMessage: message,
  })

  return {
    kombuseSessionId: appSessionId,
    backendSessionId: backend.getBackendSessionId(),
  }
}

/**
 * Send a follow-up message to a persistent backend.
 * Subscribes to events for this turn's lifecycle, then unsubscribes on completion.
 * The backend is NOT stopped on success — it remains alive for future messages.
 */
function runFollowUpChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: KombuseSessionId,
  options: Omit<ChatRunnerOptions, 'resumeSessionId'>
): void {
  let didComplete = false

  const unsubscribe = backend.subscribe((event) => {
    if (didComplete) return

    if (event.type === 'complete') {
      didComplete = true
      unsubscribe()
      if (event.reason === 'stopped') {
        options.onStopped?.('user_stop')
        return
      }
      if (event.success === false) {
        const msg = event.errorMessage
          ?? (event.exitCode != null
            ? `Process exited with code ${event.exitCode}`
            : `Agent run failed (${event.reason})`)
        options.onError?.(new Error(msg))
      } else {
        const backendSessionId = backend.getBackendSessionId()
        options.onComplete?.({
          kombuseSessionId,
          backendSessionId,
        })
      }
    } else if (event.type === 'lifecycle') {
      return
    } else {
      options.onEvent(event)
    }
  })

  backend.send(message)
}

function clearTerminalMetadataPatch(): Partial<SessionMetadata> {
  return {
    terminal_reason: undefined,
    terminal_source: undefined,
    terminal_at: undefined,
    terminal_error: undefined,
  }
}

function classifyRuntimeFailureReason(errorMessage: string | undefined): string {
  const normalized = (errorMessage ?? '').toLowerCase()
  if (normalized.includes('interrupted')) return 'turn_interrupted'
  if (normalized.includes('timed out')) return 'backend_timeout'
  if (normalized.includes('resume')) return 'resume_failed'
  if (normalized.includes('stopped')) return 'backend_stopped'
  if (normalized.includes('exit')) return 'process_exit'
  return 'agent_error'
}

function buildFailureMetadataPatch(errorMessage: string | undefined): Partial<SessionMetadata> {
  return {
    terminal_reason: classifyRuntimeFailureReason(errorMessage),
    terminal_source: 'runtime',
    terminal_at: new Date().toISOString(),
    terminal_error: errorMessage,
  }
}

type SessionLogger = ReturnType<typeof createSessionLogger>

function maybePostFallbackComment(options: {
  ticketId: number | undefined
  didCallAddComment: boolean
  lastAssistantMessage: string
  agentId: string | undefined
  kombuseSessionId: KombuseSessionId
  logger?: SessionLogger
}): void {
  if (!options.ticketId || options.didCallAddComment || !options.lastAssistantMessage.trim()) {
    return
  }

  const authorId = options.agentId ?? 'anonymous-agent'
  try {
    const sessionComments = commentsRepository.list({
      ticket_id: options.ticketId,
      kombuse_session_id: options.kombuseSessionId,
      limit: 50,
    })
    const userReply = sessionComments
      .filter((comment) => comment.author_id !== authorId)
      .pop()

    commentsRepository.create({
      ticket_id: options.ticketId,
      author_id: authorId,
      parent_id: userReply?.id,
      body: options.lastAssistantMessage.trim(),
      kombuse_session_id: options.kombuseSessionId,
    })
    options.logger?.info('fallback comment posted', { ticketId: options.ticketId, parentId: userReply?.id })
  } catch (fallbackError) {
    options.logger?.info('fallback comment failed', {
      ticketId: options.ticketId,
      error: String(fallbackError),
    })
  }
}

function handlePermissionRequest(options: {
  event: Extract<AgentEvent, { type: 'permission_request' }>
  backend: AgentBackend
  sessionId: KombuseSessionId
  ticketId: number | undefined
  preset: AgentTypePreset
  logger: SessionLogger
  emit: (event: AgentExecutionEvent) => void
}): boolean {
  const { event, backend, sessionId, ticketId, preset, logger, emit } = options
  if (
    shouldAutoApprove(event.toolName, event.input, preset) &&
    backend.respondToPermission
  ) {
    logger.info('auto-approving', { requestId: event.requestId, toolName: event.toolName })
    backend.respondToPermission(event.requestId, 'allow', { updatedInput: event.input })
    const resolvedMsg: ServerMessage = {
      type: 'agent.permission_resolved',
      sessionId,
      requestId: event.requestId,
    }
    wsHub.broadcastToTopic('*', resolvedMsg)
    wsHub.broadcastToTopic(`session:${sessionId}`, resolvedMsg)
    emit({
      type: 'event',
      kombuseSessionId: sessionId,
      event: { ...event, autoApproved: true },
    })
    return true
  }

  broadcastPermissionPending(sessionId, event, ticketId)
  return false
}

function handleRuntimeRunFailure(options: {
  dependencies: AgentExecutionDependencies
  emit: (event: AgentExecutionEvent) => void
  logger: SessionLogger
  backend: AgentBackend
  persistentSessionId: string
  appSessionId: KombuseSessionId
  ticketId: number | undefined
  continuationInvocationId: number | null
  messageText: string
}): void {
  const {
    dependencies,
    emit,
    logger,
    backend,
    persistentSessionId,
    appSessionId,
    ticketId,
    continuationInvocationId,
    messageText,
  } = options

  setSessionTurnActive(appSessionId, false)
  logger.close()
  const failureReason = classifyRuntimeFailureReason(messageText)

  const errorEvent: AgentEvent = {
    type: 'error',
    eventId: crypto.randomUUID(),
    backend: backend.name,
    timestamp: Date.now(),
    message: messageText,
    error: new Error(messageText),
  }
  dependencies.sessionPersistence.persistEvent(persistentSessionId, errorEvent)
  dependencies.stateMachine.transition(persistentSessionId, 'fail', {
    kombuseSessionId: appSessionId,
    ticketId,
    backendSessionId: backend.getBackendSessionId(),
    error: messageText,
    invocationId: continuationInvocationId ?? undefined,
    metadataPatch: buildFailureMetadataPatch(messageText),
  })
  emit({ type: 'event', kombuseSessionId: appSessionId, event: errorEvent })
  emit({
    type: 'complete',
    kombuseSessionId: appSessionId,
    ticketId,
    status: 'failed',
    reason: failureReason,
    errorMessage: messageText,
  })
  if (ticketId) {
    broadcastTicketAgentStatus(ticketId)
  }
}

function handleRuntimeRunStopped(options: {
  dependencies: AgentExecutionDependencies
  emit: (event: AgentExecutionEvent) => void
  logger: SessionLogger
  backend: AgentBackend
  persistentSessionId: string
  appSessionId: KombuseSessionId
  ticketId: number | undefined
  continuationInvocationId: number | null
  reason: string
}): void {
  const {
    dependencies,
    emit,
    logger,
    backend,
    persistentSessionId,
    appSessionId,
    ticketId,
    continuationInvocationId,
    reason,
  } = options

  const terminalAt = new Date().toISOString()
  setSessionTurnActive(appSessionId, false)
  logger.close()

  dependencies.stateMachine.transition(persistentSessionId, 'abort', {
    kombuseSessionId: appSessionId,
    ticketId,
    backendSessionId: backend.getBackendSessionId(),
    error: reason,
    invocationId: continuationInvocationId ?? undefined,
    metadataPatch: {
      terminal_reason: reason,
      terminal_source: 'runtime',
      terminal_at: terminalAt,
      terminal_error: 'Stopped by user',
    },
  })

  emit({
    type: 'complete',
    kombuseSessionId: appSessionId,
    backendSessionId: backend.getBackendSessionId(),
    ticketId,
    status: 'aborted',
    reason,
    errorMessage: 'Stopped by user',
  })
  if (ticketId) {
    broadcastTicketAgentStatus(ticketId)
  }
}

/**
 * Start a chat session initiated by a user websocket request.
 */
export function startAgentChatSession(
  message: AgentInvokeMessage,
  emit: (event: AgentExecutionEvent) => void,
  dependencies: AgentExecutionDependencies,
  options?: { projectPath?: string; ticketId?: number; systemPromptOverride?: string }
): void {
  const {
    agentId,
    message: userMessage,
    kombuseSessionId,
    projectId,
    backendType: backendTypeOverride,
    modelPreference: modelPreferenceOverride,
  } = message

  const normalizedAgentId =
    typeof agentId === 'string' && agentId.trim().length > 0
      ? agentId.trim()
      : undefined
  let agent = normalizedAgentId
    ? dependencies.getAgent(normalizedAgentId)
    : undefined

  if (normalizedAgentId && !agent) {
    emit({
      type: 'error',
      message: `Agent ${normalizedAgentId} not found`,
    })
    return
  }

  if (agent && !agent.is_enabled) {
    emit({
      type: 'error',
      message: `Agent ${agent.id} is disabled`,
    })
    return
  }

  if (!agent && kombuseSessionId) {
    const invocations = agentInvocationsRepository.list({
      kombuse_session_id: kombuseSessionId,
      limit: 1,
    })
    const firstInvocation = invocations[0]
    if (firstInvocation) {
      const resolvedAgent = dependencies.getAgent(firstInvocation.agent_id)
      if (resolvedAgent?.is_enabled) {
        agent = resolvedAgent
        console.log(
          `[Server] Resolved agent ${resolvedAgent.id} from session ${kombuseSessionId}`
        )
      }
    }
  }

  if (!agent && kombuseSessionId) {
    const existingSessionRecord = dependencies.sessionPersistence.getSessionByKombuseId(kombuseSessionId)
    if (existingSessionRecord?.agent_id) {
      const resolvedAgent = dependencies.getAgent(existingSessionRecord.agent_id)
      if (resolvedAgent?.is_enabled) {
        agent = resolvedAgent
        console.log(
          `[Server] Resolved agent ${resolvedAgent.id} from session.agent_id for ${kombuseSessionId}`
        )
      }
    }
  }

  let appSessionId: KombuseSessionId
  if (typeof kombuseSessionId === 'string' && isValidSessionId(kombuseSessionId.trim())) {
    appSessionId = kombuseSessionId.trim() as KombuseSessionId
  } else {
    appSessionId = dependencies.generateSessionId()
  }

  const existingSessionByKombuse = dependencies.sessionPersistence.getSessionByKombuseId(appSessionId)
  const backendTypeFromAgentConfig = resolveConfiguredBackendType(
    (agent?.config as { backend_type?: unknown } | undefined)?.backend_type
  )
  const userDefaultBackendType = readUserDefaultBackendType()
  const resolvedBackendType = resolveBackendType({
    sessionBackendType:
      resolveConfiguredBackendType(backendTypeOverride)
      ?? existingSessionByKombuse?.backend_type,
    agentBackendType: backendTypeFromAgentConfig,
    userDefaultBackendType,
    fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
  })

  const persistedSessionModelPreference = normalizeModelPreference(
    existingSessionByKombuse?.metadata?.model_preference
  )
  const sessionModelPreference = persistedSessionModelPreference
    ?? normalizeModelPreference(modelPreferenceOverride)
  const agentModelPreference = normalizeModelPreference(
    (agent?.config as { model?: unknown } | undefined)?.model
  )
  const userDefaultModelPreference = readUserDefaultModelPreference()
  const {
    modelPreference: resolvedModelPreference,
    appliedModel: resolvedAppliedModel,
  } = resolveModelPreference({
    sessionModelPreference,
    agentModelPreference,
    userDefaultModelPreference,
    backendType: resolvedBackendType,
  })

  const persistentSessionId = dependencies.sessionPersistence.ensureSession(
    appSessionId,
    resolvedBackendType,
    options?.ticketId,
    agent?.id
  )
  const existingSession = dependencies.sessionPersistence.getSession(
    persistentSessionId
  )

  const metadataPatch: Partial<SessionMetadata> = {}
  if ((existingSession?.metadata?.effective_backend ?? null) !== resolvedBackendType) {
    metadataPatch.effective_backend = resolvedBackendType
  }
  if ((existingSession?.metadata?.model_preference ?? null) !== (resolvedModelPreference ?? null)) {
    metadataPatch.model_preference = resolvedModelPreference ?? null
  }
  if ((existingSession?.metadata?.applied_model ?? null) !== (resolvedAppliedModel ?? null)) {
    metadataPatch.applied_model = resolvedAppliedModel ?? null
  }
  if (Object.keys(metadataPatch).length > 0) {
    dependencies.stateMachine.setMetadata(persistentSessionId, metadataPatch)
  }

  const ticketId = options?.ticketId ?? existingSession?.ticket_id ?? undefined
  const resumeSessionId =
    typeof existingSession?.backend_session_id === 'string' &&
    existingSession.backend_session_id.trim().length > 0
      ? existingSession.backend_session_id.trim()
      : undefined

  const agentName = agent
    ? (profilesRepository.get(agent.id)?.name ?? agent.id)
    : undefined

  let continuationInvocationId: number | null = null
  const existingInvocations = agentInvocationsRepository.list({
    kombuse_session_id: appSessionId,
  })
  for (const invocation of existingInvocations) {
    if (!invocation.session_id) {
      agentInvocationsRepository.update(invocation.id, { session_id: persistentSessionId })
    }
  }
  const lastInvocation = existingInvocations[0]
  if (
    lastInvocation &&
    (lastInvocation.status === 'failed' || lastInvocation.status === 'completed')
  ) {
    const continuation = agentInvocationsRepository.create({
      agent_id: lastInvocation.agent_id,
      trigger_id: lastInvocation.trigger_id,
      event_id: lastInvocation.event_id ?? undefined,
      session_id: persistentSessionId,
      context: lastInvocation.context,
    })
    agentInvocationsRepository.update(continuation.id, {
      kombuse_session_id: appSessionId,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    continuationInvocationId = continuation.id
  }

  let existingBackend = activeBackends.get(appSessionId)
  if (
    existingBackend
    && existingBackend.isRunning()
    && existingBackend.name !== resolvedBackendType
  ) {
    console.log(
      `[Server] Backend mismatch for session ${appSessionId}; replacing ${existingBackend.name} with ${resolvedBackendType}`
    )
    void existingBackend.stop().catch(() => {
      // Best effort stop when swapping backend type.
    })
    unregisterBackend(appSessionId)
    existingBackend = undefined
  }

  if (existingBackend && existingBackend.isRunning()) {
    dependencies.stateMachine.transition(persistentSessionId, 'continue', {
      kombuseSessionId: appSessionId,
      ticketId,
      metadataPatch: clearTerminalMetadataPatch(),
    })

    const reusedLogger = createSessionLogger({
      kombuseSessionId: appSessionId,
      getBackendSessionId: () => existingBackend.getBackendSessionId(),
    })

    const reusedUserEvent: AgentEvent = {
      type: 'message',
      eventId: crypto.randomUUID(),
      backend: existingBackend.name,
      timestamp: Date.now(),
      role: 'user',
      content: userMessage,
    }
    dependencies.sessionPersistence.persistEvent(persistentSessionId, reusedUserEvent)

    emit({
      type: 'started',
      kombuseSessionId: appSessionId,
      ticketId,
      agentName,
      startedAt: new Date().toISOString(),
    })

    const agentType = (agent?.config as { type?: string } | undefined)?.type
    const preset = getTypePreset(agentType)
    let followUpDidCallAddComment = false
    let followUpLastAssistantMessage = ''

    setSessionTurnActive(appSessionId, true)
    runFollowUpChat(existingBackend, userMessage, appSessionId, {
      projectPath: '',
      onEvent: (event: AgentEvent) => {
        reusedLogger.logEvent(event)

        if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization' && process.env.KOMBUSE_LOG_LEVEL !== 'debug') {
          return
        }
        if (event.type === 'lifecycle') {
          return
        }

        dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

        if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
          followUpDidCallAddComment = true
        }
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
          followUpLastAssistantMessage = event.content
        }

        if (event.type === 'permission_request') {
          const wasAutoApproved = handlePermissionRequest({
            event,
            backend: existingBackend,
            sessionId: appSessionId,
            ticketId,
            preset,
            logger: reusedLogger,
            emit,
          })
          if (wasAutoApproved) {
            return
          }
        }

        emit({ type: 'event', kombuseSessionId: appSessionId, event })
      },
      onComplete: (context: ConversationContext) => {
        setSessionTurnActive(appSessionId, false)
        reusedLogger.close()
        dependencies.stateMachine.transition(persistentSessionId, 'complete', {
          kombuseSessionId: appSessionId,
          ticketId,
          backendSessionId: context.backendSessionId,
          invocationId: continuationInvocationId ?? undefined,
        })

        maybePostFallbackComment({
          ticketId,
          didCallAddComment: followUpDidCallAddComment,
          lastAssistantMessage: followUpLastAssistantMessage,
          agentId: agent?.id,
          kombuseSessionId: appSessionId,
        })

        emit({
          type: 'complete',
          kombuseSessionId: appSessionId,
          backendSessionId: context.backendSessionId,
          ticketId,
          status: 'completed',
          reason: 'result',
        })
      },
      onStopped: (reason: string) => {
        handleRuntimeRunStopped({
          dependencies,
          emit,
          logger: reusedLogger,
          backend: existingBackend,
          persistentSessionId,
          appSessionId,
          ticketId,
          continuationInvocationId,
          reason,
        })
      },
      onError: (error: Error) => {
        handleRuntimeRunFailure({
          dependencies,
          emit,
          logger: reusedLogger,
          backend: existingBackend,
          persistentSessionId,
          appSessionId,
          ticketId,
          continuationInvocationId,
          messageText: error.message,
        })
      },
    })

    return
  }

  const backend = dependencies.createBackend(resolvedBackendType)

  const sessionForTransition = dependencies.sessionPersistence.getSession(persistentSessionId)
  const transitionEvent = sessionForTransition?.status === 'pending' ? 'start' as const : 'continue' as const
  dependencies.stateMachine.transition(persistentSessionId, transitionEvent, {
    kombuseSessionId: appSessionId,
    ticketId,
    backend,
    metadataPatch: clearTerminalMetadataPatch(),
  })

  const logger = createSessionLogger({
    kombuseSessionId: appSessionId,
    getBackendSessionId: () => backend.getBackendSessionId(),
  })

  emit({
    type: 'started',
    kombuseSessionId: appSessionId,
    ticketId,
    agentName,
    startedAt: new Date().toISOString(),
  })

  const userMessageEvent: AgentEvent = {
    type: 'message',
    eventId: crypto.randomUUID(),
    backend: backend.name,
    timestamp: Date.now(),
    role: 'user',
    content: userMessage,
  }
  dependencies.sessionPersistence.persistEvent(persistentSessionId, userMessageEvent)

  const projectPathOverride =
    options?.projectPath ??
    (typeof projectId === 'string' && projectId.trim().length > 0
      ? dependencies.resolveProjectPathForProject?.(projectId.trim())
      : undefined)

  const agentType = (agent?.config as { type?: string } | undefined)?.type
  const preset = getTypePreset(agentType)

  let resolvedSystemPrompt: string | undefined
  if (options?.systemPromptOverride) {
    resolvedSystemPrompt = options.systemPromptOverride
  } else if (agent && preset.preambleTemplate) {
    const preambleContext = {
      event_type: '',
      ticket_id: ticketId ?? null,
      project_id: projectId ?? null,
      comment_id: null,
      actor_id: null,
      actor_type: 'user' as const,
      payload: {} as Record<string, unknown>,
      kombuse_session_id: appSessionId,
      agents: profilesRepository.list({ type: 'agent', is_active: true }).map((profile) => ({ id: profile.id, name: profile.name })),
    }
    resolvedSystemPrompt = renderTemplate(preset.preambleTemplate, preambleContext)

    if (agent.system_prompt && (resumeSessionId || existingSession)) {
      const renderedRolePrompt = renderTemplate(agent.system_prompt, preambleContext)
      resolvedSystemPrompt += `\n\n## Agent Role\n${renderedRolePrompt}`
    }
  }

  const allowedTools = presetToAllowedTools(preset)

  const restoredMetadata = dependencies.stateMachine.getMetadata(persistentSessionId)
  let didCallAddComment = restoredMetadata.didCallAddComment ?? false
  let lastAssistantMessage = restoredMetadata.lastAssistantMessage ?? ''
  let planCommentId = restoredMetadata.planCommentId
  let exitPlanModeToolUseId = restoredMetadata.exitPlanModeToolUseId

  setSessionTurnActive(appSessionId, true)
  runAgentChat(backend, userMessage, appSessionId, {
    projectPath: projectPathOverride ?? dependencies.resolveProjectPath(),
    resumeSessionId,
    model: resolvedAppliedModel,
    systemPrompt: resolvedSystemPrompt,
    allowedTools,
    permissionMode: preset.permissionMode,
    onEvent: (event: AgentEvent) => {
      logger.logEvent(event)

      if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization' && process.env.KOMBUSE_LOG_LEVEL !== 'debug') {
        return
      }
      if (event.type === 'lifecycle') {
        return
      }

      dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

      if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
        didCallAddComment = true
        dependencies.stateMachine.setMetadata(persistentSessionId, { didCallAddComment: true })
      }
      if (event.type === 'message' && event.role === 'assistant' && event.content) {
        lastAssistantMessage = event.content
        dependencies.stateMachine.setMetadata(persistentSessionId, { lastAssistantMessage: event.content })
      }

      if (event.type === 'tool_use' && event.name === 'ExitPlanMode') {
        exitPlanModeToolUseId = event.id
        dependencies.stateMachine.setMetadata(persistentSessionId, { exitPlanModeToolUseId: event.id })
      }
      if (
        event.type === 'tool_result' &&
        exitPlanModeToolUseId &&
        event.toolUseId === exitPlanModeToolUseId &&
        ticketId &&
        !event.isError
      ) {
        exitPlanModeToolUseId = undefined
        dependencies.stateMachine.setMetadata(persistentSessionId, { exitPlanModeToolUseId: undefined })
        const planText = typeof event.content === 'string'
          ? event.content
          : Array.isArray(event.content)
            ? event.content
                .filter((block): block is { type: string; text: string } =>
                  typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'text'
                )
                .map((block) => block.text)
                .join('\n')
            : ''
        if (planText.trim()) {
          const authorId = agent?.id ?? 'anonymous-agent'
          const marker = '## Approved Plan:\n'
          const markerIdx = planText.indexOf(marker)
          const cleanPlan = markerIdx !== -1
            ? planText.slice(markerIdx + marker.length).trim()
            : planText.trim()
          const commentBody = `**Implementation Plan**\n\n${cleanPlan}`
          try {
            if (planCommentId) {
              commentsRepository.update(planCommentId, { body: commentBody })
              logger.info('plan comment updated', { commentId: planCommentId, ticketId })
            } else {
              const created = commentsRepository.create({
                ticket_id: ticketId,
                author_id: authorId,
                body: commentBody,
                kombuse_session_id: appSessionId,
              })
              planCommentId = created.id
              dependencies.stateMachine.setMetadata(persistentSessionId, { planCommentId: created.id })
              logger.info('plan comment created', { commentId: planCommentId, ticketId })
            }
          } catch (planCommentError) {
            logger.info('plan comment failed', { ticketId, error: String(planCommentError) })
          }
        }
      }

      if (event.type === 'permission_request') {
        const wasAutoApproved = handlePermissionRequest({
          event,
          backend,
          sessionId: appSessionId,
          ticketId,
          preset,
          logger,
          emit,
        })
        if (wasAutoApproved) {
          return
        }
      }

      emit({
        type: 'event',
        kombuseSessionId: appSessionId,
        event,
      })
    },
    onComplete: (context: ConversationContext) => {
      setSessionTurnActive(appSessionId, false)
      logger.close()

      const sentinelUnsub = backend.subscribe((event) => {
        if (event.type === 'complete' && event.reason === 'process_exit') {
          unregisterBackend(appSessionId)
          sentinelUnsub()
        }
      })

      dependencies.stateMachine.transition(persistentSessionId, 'complete', {
        kombuseSessionId: appSessionId,
        ticketId,
        backendSessionId: context.backendSessionId,
        invocationId: continuationInvocationId ?? undefined,
      })

      maybePostFallbackComment({
        ticketId,
        didCallAddComment,
        lastAssistantMessage,
        agentId: agent?.id,
        kombuseSessionId: appSessionId,
        logger,
      })

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        backendSessionId: context.backendSessionId,
        ticketId,
        status: 'completed',
        reason: 'result',
      })
    },
    onStopped: (reason: string) => {
      handleRuntimeRunStopped({
        dependencies,
        emit,
        logger,
        backend,
        persistentSessionId,
        appSessionId,
        ticketId,
        continuationInvocationId,
        reason,
      })
    },
    onResumeFailed: resumeSessionId ? () => {
      setSessionTurnActive(appSessionId, false)
      logger.info('resume failed, retrying without --resume')

      dependencies.stateMachine.transition(persistentSessionId, 'fail', {
        kombuseSessionId: appSessionId,
        ticketId,
        error: 'resume_failed',
        metadataPatch: buildFailureMetadataPatch('resume_failed'),
      })

      didCallAddComment = false
      lastAssistantMessage = ''
      dependencies.stateMachine.setMetadata(persistentSessionId, {
        didCallAddComment: false,
        lastAssistantMessage: '',
      })

      let fallbackSystemPrompt = resolvedSystemPrompt
      const priorEvents = dependencies.sessionPersistence.getSessionEvents(persistentSessionId)
      const conversationHistory = buildConversationSummary(priorEvents)
      if (conversationHistory) {
        fallbackSystemPrompt = (fallbackSystemPrompt ?? '') +
          `\n\n## Prior Conversation\nThe following is the conversation history from a previous session. Use this context to maintain continuity.\n\n${conversationHistory}`
      }

      const retryBackend = dependencies.createBackend(resolvedBackendType)
      dependencies.stateMachine.transition(persistentSessionId, 'continue', {
        kombuseSessionId: appSessionId,
        ticketId,
        backend: retryBackend,
        metadataPatch: clearTerminalMetadataPatch(),
      })

      setSessionTurnActive(appSessionId, true)
      runAgentChat(retryBackend, userMessage, appSessionId, {
        projectPath: projectPathOverride ?? dependencies.resolveProjectPath(),
        systemPrompt: fallbackSystemPrompt,
        allowedTools,
        permissionMode: preset.permissionMode,
        onEvent: (event: AgentEvent) => {
          logger.logEvent(event)

          if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization' && process.env.KOMBUSE_LOG_LEVEL !== 'debug') {
            return
          }
          if (event.type === 'lifecycle') {
            return
          }

          dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
          if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
            didCallAddComment = true
          }
          if (event.type === 'message' && event.role === 'assistant' && event.content) {
            lastAssistantMessage = event.content
          }

          if (event.type === 'permission_request') {
            const wasAutoApproved = handlePermissionRequest({
              event,
              backend: retryBackend,
              sessionId: appSessionId,
              ticketId,
              preset,
              logger,
              emit,
            })
            if (wasAutoApproved) {
              return
            }
          }

          emit({ type: 'event', kombuseSessionId: appSessionId, event })
        },
        onComplete: (context: ConversationContext) => {
          setSessionTurnActive(appSessionId, false)
          logger.close()
          const retrySentinelUnsub = retryBackend.subscribe((event) => {
            if (event.type === 'complete' && event.reason === 'process_exit') {
              unregisterBackend(appSessionId)
              retrySentinelUnsub()
            }
          })
          dependencies.stateMachine.transition(persistentSessionId, 'complete', {
            kombuseSessionId: appSessionId,
            ticketId,
            backendSessionId: context.backendSessionId,
            invocationId: continuationInvocationId ?? undefined,
          })
          maybePostFallbackComment({
            ticketId,
            didCallAddComment,
            lastAssistantMessage,
            agentId: agent?.id,
            kombuseSessionId: appSessionId,
          })
          emit({
            type: 'complete',
            kombuseSessionId: appSessionId,
            backendSessionId: context.backendSessionId,
            ticketId,
            status: 'completed',
            reason: 'result',
          })
        },
        onStopped: (reason: string) => {
          handleRuntimeRunStopped({
            dependencies,
            emit,
            logger,
            backend: retryBackend,
            persistentSessionId,
            appSessionId,
            ticketId,
            continuationInvocationId,
            reason,
          })
        },
        onError: (error: Error) => {
          handleRuntimeRunFailure({
            dependencies,
            emit,
            logger,
            backend: retryBackend,
            persistentSessionId,
            appSessionId,
            ticketId,
            continuationInvocationId,
            messageText: error.message,
          })
        },
      }).catch((retryError: unknown) => {
        setSessionTurnActive(appSessionId, false)
        logger.close()
        const messageText = retryError instanceof Error ? retryError.message : String(retryError)
        const failureReason = classifyRuntimeFailureReason(messageText)
        dependencies.stateMachine.transition(persistentSessionId, 'fail', {
          kombuseSessionId: appSessionId,
          ticketId,
          backendSessionId: retryBackend.getBackendSessionId(),
          error: messageText,
          invocationId: continuationInvocationId ?? undefined,
          metadataPatch: buildFailureMetadataPatch(messageText),
        })
        emit({ type: 'error', message: `Failed to start agent (retry): ${messageText}` })
        emit({
          type: 'complete',
          kombuseSessionId: appSessionId,
          ticketId,
          status: 'failed',
          reason: failureReason,
          errorMessage: messageText,
        })
        if (ticketId) broadcastTicketAgentStatus(ticketId)
      })
    } : undefined,
    onError: (error: Error) => {
      handleRuntimeRunFailure({
        dependencies,
        emit,
        logger,
        backend,
        persistentSessionId,
        appSessionId,
        ticketId,
        continuationInvocationId,
        messageText: error.message,
      })
    },
  }).catch((error: unknown) => {
    setSessionTurnActive(appSessionId, false)
    logger.close()

    const messageText =
      error instanceof Error ? error.message : String(error)
    const failureReason = classifyRuntimeFailureReason(messageText)

    dependencies.stateMachine.transition(persistentSessionId, 'fail', {
      kombuseSessionId: appSessionId,
      ticketId,
      backendSessionId: backend.getBackendSessionId(),
      error: messageText,
      invocationId: continuationInvocationId ?? undefined,
      metadataPatch: buildFailureMetadataPatch(messageText),
    })

    emit({
      type: 'error',
      message: `Failed to start agent: ${messageText}`,
    })
    emit({
      type: 'complete',
      kombuseSessionId: appSessionId,
      ticketId,
      status: 'failed',
      reason: failureReason,
      errorMessage: messageText,
    })

    if (ticketId) {
      broadcastTicketAgentStatus(ticketId)
    }
  })
}
