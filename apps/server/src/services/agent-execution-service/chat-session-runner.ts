import {
  agentInvocationsRepository,
  agentsRepository,
  commentsRepository,
  DEMO_PROJECT_ID,
  profilesRepository,
  projectsRepository,
  ticketsRepository,
} from '@kombuse/persistence'
import { buildConversationSummary, renderTemplateWithIncludes } from '@kombuse/services'
import {
  BACKEND_TYPES,
  isValidSessionId,
  type AgentBackend,
  type AgentEvent,
  type ConversationContext,
  type ImageAttachment,
  type KombuseSessionId,
  type PermissionMode,
  type ServerMessage,
  type SessionMetadata,
} from '@kombuse/types'
import { createAppLogger } from '@kombuse/core/logger'
import { createSessionLogger } from '../../logger'
import { wsHub } from '../../websocket/hub'
import {
  normalizeModelPreference,
  readUserDefaultBackendType,
  readUserDefaultModelPreference,
  resolveBackendType,
  resolveConfiguredBackendType,
  resolveModelPreference,
} from '@kombuse/services'
import { checkAllBackendStatuses } from '../backend-status'
import { meetsMinimumVersion } from '@kombuse/pkg'
import { broadcastTicketAgentStatus, unregisterBackend } from './backend-registry'
import { buildPersistedContent } from './content-helpers'
import { buildAgentTemplateContext } from './template-context'
import { broadcastPermissionPending } from './permission-service'
import { getEffectivePreset, mergeFilePermissions, presetToAllowedTools, shouldAutoApprove, type AgentTypePreset } from '@kombuse/services'
import { activeBackends, createPermissionKey, setSessionTurnActive, IDLE_TURN_TIMEOUT_MS } from './runtime-state'
import type {
  AgentExecutionDependencies,
  AgentExecutionEvent,
  AgentInvokeMessage,
} from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import * as Sentry from '@sentry/node'
import { isSentryEnabled } from '../../sentry-gate'

const log = createAppLogger('ChatSessionRunner')

/**
 * Read AGENTS.md from a project directory if it exists.
 * Returns the trimmed file content, or undefined if the file is missing or empty.
 */
export function readAgentsMd(projectPath: string): string | undefined {
  const agentsMdPath = join(projectPath, 'AGENTS.md')
  if (!existsSync(agentsMdPath)) return undefined
  try {
    const content = readFileSync(agentsMdPath, 'utf-8').trim()
    return content.length > 0 ? content : undefined
  } catch {
    return undefined
  }
}

export function resolveDesktopContext(overrideDbPath?: string): import('@kombuse/types').DesktopContext | undefined {
  const docsDbPath = overrideDbPath ?? join(homedir(), '.kombuse', 'docs.db')
  const docsDbExists = existsSync(docsDbPath)
  if (!docsDbExists) {
    return { docs_db_exists: false, docs_db_project_count: 0, docs_db_ticket_count: 0, demo_project_id: null }
  }
  try {
    const db = new Database(docsDbPath, { readonly: true })
    const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number })?.c ?? 0
    const ticketCount = (db.prepare('SELECT COUNT(*) as c FROM tickets').get() as { c: number })?.c ?? 0
    const demoProject = db.prepare('SELECT id FROM projects WHERE id = ?').get(DEMO_PROJECT_ID) as { id: string } | undefined
    db.close()
    return { docs_db_exists: true, docs_db_project_count: projectCount, docs_db_ticket_count: ticketCount, demo_project_id: demoProject?.id ?? null }
  } catch {
    return { docs_db_exists: true, docs_db_project_count: 0, docs_db_ticket_count: 0, demo_project_id: null }
  }
}

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

interface IdleWatcher {
  onEvent(): void
  onPermissionRequest(): void
  onPermissionResponse(): void
  complete(): void
  readonly idleAbortTriggered: boolean
}

function createIdleWatcher(
  backend: AgentBackend,
  sessionId: string,
  label: string
): IdleWatcher {
  let lastEventTimestamp = Date.now()
  let pendingPermission = false
  let _idleAbortTriggered = false
  let stopped = false

  const idleCheckInterval = setInterval(() => {
    if (stopped) {
      clearInterval(idleCheckInterval)
      return
    }
    if (pendingPermission) {
      lastEventTimestamp = Date.now()
      return
    }
    const elapsed = Date.now() - lastEventTimestamp
    if (elapsed > IDLE_TURN_TIMEOUT_MS) {
      const suffix = label ? ` ${label}` : ''
      log.warn(`In-turn idle timeout exceeded${suffix}`, {
        sessionId,
        elapsedMs: elapsed,
        timeoutMs: IDLE_TURN_TIMEOUT_MS,
      })
      clearInterval(idleCheckInterval)
      _idleAbortTriggered = true
      void backend.stop().catch(() => {})
    }
  }, 60_000)
  if (idleCheckInterval.unref) idleCheckInterval.unref()

  return {
    onEvent() { lastEventTimestamp = Date.now() },
    onPermissionRequest() { pendingPermission = true },
    onPermissionResponse() { pendingPermission = false },
    complete() {
      stopped = true
      clearInterval(idleCheckInterval)
    },
    get idleAbortTriggered() { return _idleAbortTriggered },
  }
}

/**
 * Run a chat message through an agent backend.
 * Returns immediately after starting - events come via callbacks.
 */
async function runAgentChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: KombuseSessionId,
  options: ChatRunnerOptions,
  images?: ImageAttachment[]
): Promise<ConversationContext> {
  const appSessionId = kombuseSessionId
  let didComplete = false
  const idle = createIdleWatcher(backend, appSessionId, '')

  const finalize = (keepAlive = false) => {
    idle.complete()
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

    if (event.type !== 'lifecycle') {
      idle.onEvent()
    }
    if (event.type === 'permission_request') {
      idle.onPermissionRequest()
    }
    if (event.type === 'permission_response') {
      idle.onPermissionResponse()
    }

    if (event.type === 'complete') {
      didComplete = true
      if (event.resumeFailed && options.onResumeFailed) {
        finalize()
        options.onResumeFailed()
        return
      }
      if (event.reason === 'stopped') {
        options.onStopped?.(idle.idleAbortTriggered ? 'idle_turn_timeout' : 'user_stop')
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

  try {
    await backend.start({
      kombuseSessionId: appSessionId,
      resumeSessionId: options.resumeSessionId,
      model: options.model,
      projectPath: options.projectPath,
      systemPrompt: options.systemPrompt,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      initialMessage: message,
      initialImages: images,
    })
  } catch (error) {
    if (didComplete) {
      return {
        kombuseSessionId: appSessionId,
        backendSessionId: backend.getBackendSessionId(),
      }
    }
    throw error
  }

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
  options: Omit<ChatRunnerOptions, 'resumeSessionId'>,
  images?: ImageAttachment[]
): void {
  let didComplete = false
  const idle = createIdleWatcher(backend, kombuseSessionId, '(follow-up)')

  const unsubscribe = backend.subscribe((event) => {
    if (didComplete) return

    if (event.type !== 'lifecycle') {
      idle.onEvent()
    }
    if (event.type === 'permission_request') {
      idle.onPermissionRequest()
    }
    if (event.type === 'permission_response') {
      idle.onPermissionResponse()
    }

    if (event.type === 'complete') {
      didComplete = true
      idle.complete()
      unsubscribe()
      if (event.reason === 'stopped') {
        options.onStopped?.(idle.idleAbortTriggered ? 'idle_turn_timeout' : 'user_stop')
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

  backend.send(message, images)
}

function clearTerminalMetadataPatch(): Partial<SessionMetadata> {
  return {
    terminal_reason: undefined,
    terminal_source: undefined,
    terminal_at: undefined,
    terminal_error: undefined,
  }
}

function normalizeProjectId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function resolveContinuationProjectId(options: {
  messageProjectId: unknown
  persistedSessionProjectId: unknown
  invocationProjectId: unknown
  invocationContext: Record<string, unknown>
}): string | undefined {
  const trustedProjectId =
    normalizeProjectId(options.persistedSessionProjectId)
    ?? normalizeProjectId(options.invocationProjectId)
    ?? normalizeProjectId(options.messageProjectId)

  if (trustedProjectId) {
    return trustedProjectId
  }

  const legacyContextProjectId = normalizeProjectId(options.invocationContext.project_id)
  if (!legacyContextProjectId) {
    return undefined
  }

  return projectsRepository.get(legacyContextProjectId) ? legacyContextProjectId : undefined
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
  ticketNumber: number | undefined
  projectId: string | undefined
  agentId: string | undefined
  agentPluginId: string | undefined
  logger: SessionLogger
  emit: (event: AgentExecutionEvent) => void
}): boolean {
  const { event, backend, sessionId, ticketNumber, projectId, agentId, agentPluginId, logger, emit } = options

  // Re-read agent from DB on every permission request so "Always Allow" takes effect immediately
  const freshAgent = agentId ? agentsRepository.get(agentId) : null
  const agentType = (freshAgent?.config as { type?: string } | undefined)?.type
  const dbPreset = getEffectivePreset(agentType, freshAgent?.config, agentPluginId)

  // Merge file-based permissions (project + global) — deny > allow
  const projectPath = projectId
    ? projectsRepository.get(projectId)?.local_path?.trim() || undefined
    : undefined
  const preset = mergeFilePermissions(dbPreset, projectPath)

  if (
    shouldAutoApprove(event.toolName, event.input, preset) &&
    backend.respondToPermission
  ) {
    logger.info('auto-approving', { requestId: event.requestId, toolName: event.toolName })
    backend.respondToPermission(event.requestId, 'allow', { updatedInput: event.input })
    const resolvedMsg: ServerMessage = {
      type: 'agent.permission_resolved',
      permissionKey: createPermissionKey(sessionId, event.requestId),
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

  logger.info('permission not auto-approved', {
    toolName: event.toolName,
    ...(event.toolName === 'Bash' && event.input?.command ? { command: String(event.input.command) } : {}),
    ...(event.toolName === 'Bash' ? { autoApprovedBashCommands: preset.autoApprovedBashCommands } : {}),
  })
  broadcastPermissionPending(sessionId, event, ticketNumber, projectId)
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
  ticketNumber: number | undefined
  projectId: string | undefined
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
    ticketNumber,
    projectId,
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
  if (isSentryEnabled()) {
    Sentry.captureException(new Error(messageText), {
      tags: { sessionId: persistentSessionId, failureReason },
      extra: { appSessionId, ticketId, ticketNumber, projectId },
    })
  }
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
    ticketNumber,
    projectId,
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
  ticketNumber: number | undefined
  projectId: string | undefined
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
    ticketNumber,
    projectId,
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
    ticketNumber,
    projectId,
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
  options?: { projectPath?: string; ticketId?: number; systemPromptOverride?: string; initialInvocationId?: number }
): void {
  const {
    agentId,
    message: userMessage,
    images,
    kombuseSessionId,
    projectId,
    backendType: backendTypeOverride,
    modelPreference: modelPreferenceOverride,
    userEventId,
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
        log.debug(
          `Resolved agent ${resolvedAgent.id} from session ${kombuseSessionId}`
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
        log.debug(
          `Resolved agent ${resolvedAgent.id} from session.agent_id for ${kombuseSessionId}`
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

  // Per-agent minimum version gate
  const agentMinVersion = (agent?.config as { min_backend_version?: string } | undefined)?.min_backend_version
  if (agentMinVersion && resolvedBackendType !== BACKEND_TYPES.MOCK) {
    const statuses = checkAllBackendStatuses()
    const status = statuses.find(s => s.backendType === resolvedBackendType)
    if (status?.version && !meetsMinimumVersion(status.version, agentMinVersion)) {
      emit({
        type: 'error',
        message: `Backend ${resolvedBackendType} version ${status.version} does not meet minimum ${agentMinVersion} required by this agent. Please update your CLI.`,
      })
      return
    }
  }

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
    agent?.id,
    projectId
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
  const ticketRecord = typeof ticketId === 'number'
    ? ticketsRepository._getInternal(ticketId) ?? undefined
    : undefined
  const ticketTitle = ticketRecord?.title
  const ticketNumber = ticketRecord?.ticket_number ?? undefined
  const resumeSessionId =
    typeof existingSession?.backend_session_id === 'string' &&
    existingSession.backend_session_id.trim().length > 0
      ? existingSession.backend_session_id.trim()
      : undefined

  const agentName = agent
    ? (profilesRepository.get(agent.id)?.name ?? agent.id)
    : undefined

  let continuationInvocationId: number | null = null
  let continuationProjectId: string | undefined
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
    continuationProjectId = resolveContinuationProjectId({
      messageProjectId: projectId,
      persistedSessionProjectId: existingSession?.project_id,
      invocationProjectId: lastInvocation.project_id,
      invocationContext: lastInvocation.context,
    })
    const continuation = agentInvocationsRepository.create({
      agent_id: lastInvocation.agent_id,
      trigger_id: lastInvocation.trigger_id,
      event_id: lastInvocation.event_id ?? undefined,
      session_id: persistentSessionId,
      project_id: continuationProjectId,
      context: lastInvocation.context,
    })
    agentInvocationsRepository.update(continuation.id, {
      kombuse_session_id: appSessionId,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    continuationInvocationId = continuation.id
  } else if (lastInvocation && lastInvocation.status === 'running') {
    // Reuse the stuck running invocation (e.g., server restarted mid-execution).
    // The state machine will mark it completed/failed when the session finishes.
    continuationInvocationId = lastInvocation.id
    continuationProjectId = resolveContinuationProjectId({
      messageProjectId: projectId,
      persistedSessionProjectId: existingSession?.project_id,
      invocationProjectId: lastInvocation.project_id,
      invocationContext: lastInvocation.context,
    })
  }

  // If no continuation was resolved but an initial invocation ID was provided
  // (e.g., trigger-orchestrator passing the original invocation), use it.
  if (continuationInvocationId === null && options?.initialInvocationId) {
    continuationInvocationId = options.initialInvocationId
  }

  const effectiveProjectId: string | undefined =
    continuationProjectId ?? normalizeProjectId(projectId)

  // Create an initial invocation for chat-originated agent sessions so that
  // resolveAgentContext() can authenticate the agent for MCP tool calls.
  if (continuationInvocationId === null && agent) {
    const chatInvocation = agentInvocationsRepository.create({
      agent_id: agent.id,
      session_id: persistentSessionId,
      project_id: effectiveProjectId,
      context: {
        event_type: 'chat.started',
        project_id: effectiveProjectId ?? null,
        ticket_id: ticketId ?? null,
      },
    })
    agentInvocationsRepository.update(chatInvocation.id, {
      kombuse_session_id: appSessionId,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    continuationInvocationId = chatInvocation.id
  }

  let existingBackend = activeBackends.get(appSessionId)
  if (
    existingBackend
    && existingBackend.isRunning()
    && existingBackend.name !== resolvedBackendType
  ) {
    log.debug(
      `Backend mismatch for session ${appSessionId}; replacing ${existingBackend.name} with ${resolvedBackendType}`
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
      eventId: userEventId ?? crypto.randomUUID(),
      backend: existingBackend.name,
      timestamp: Date.now(),
      role: 'user',
      content: buildPersistedContent(userMessage, images),
    }
    dependencies.sessionPersistence.persistEvent(persistentSessionId, reusedUserEvent)

    emit({
      type: 'started',
      kombuseSessionId: appSessionId,
      ticketNumber,
      ticketTitle,
      projectId: effectiveProjectId,
      agentName,
      effectiveBackend: resolvedBackendType,
      appliedModel: resolvedAppliedModel,
      startedAt: new Date().toISOString(),
    })

    const agentType = (agent?.config as { type?: string } | undefined)?.type
    const preset = getEffectivePreset(agentType, agent?.config, agent?.plugin_id ?? undefined)
    dependencies.stateMachine.setMetadata(persistentSessionId, {
      agent_preset_type: agentType ?? 'kombuse',
      permission_mode: preset.permissionMode ?? null,
      thinking_enabled: !!agent?.config?.anthropic?.thinking,
      thinking_budget: agent?.config?.anthropic?.thinking_budget ?? null,
    })
    let followUpDidCallAddComment = false
    let followUpLastAssistantMessage = ''

    setSessionTurnActive(appSessionId, true)
    runFollowUpChat(existingBackend, userMessage, appSessionId, {
      projectPath: '',
      onEvent: (event: AgentEvent) => {
        reusedLogger.logEvent(event)

        if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization') {
          dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
          return
        }
        if (event.type === 'lifecycle') {
          return
        }

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
            ticketNumber,
            projectId: effectiveProjectId,
            agentId: agent?.id,
            agentPluginId: agent?.plugin_id ?? undefined,
            logger: reusedLogger,
            emit,
          })
          if (wasAutoApproved) {
            dependencies.sessionPersistence.persistEvent(persistentSessionId, { ...event, autoApproved: true })
            return
          }
        }

        dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
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

        if (!followUpLastAssistantMessage.trim() && isSentryEnabled()) {
          Sentry.captureEvent({
            level: 'warning',
            message: 'Session completed with no assistant message output',
            extra: {
              sessionId: appSessionId,
              agentId: agent?.id,
              backendType: resolvedBackendType,
              ticketNumber,
              projectId: effectiveProjectId,
            },
          })
        }

        emit({
          type: 'complete',
          kombuseSessionId: appSessionId,
          backendSessionId: context.backendSessionId,
          ticketNumber,
          projectId: effectiveProjectId,
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
          ticketNumber,
          projectId: effectiveProjectId,
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
          ticketNumber,
          projectId: effectiveProjectId,
          continuationInvocationId,
          messageText: error.message,
        })
      },
    }, images)

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
    ticketNumber,
    ticketTitle,
    projectId: effectiveProjectId,
    agentName,
    effectiveBackend: resolvedBackendType,
    appliedModel: resolvedAppliedModel,
    startedAt: new Date().toISOString(),
  })

  const userMessageEvent: AgentEvent = {
    type: 'message',
    eventId: userEventId ?? crypto.randomUUID(),
    backend: backend.name,
    timestamp: Date.now(),
    role: 'user',
    content: buildPersistedContent(userMessage, images),
  }
  dependencies.sessionPersistence.persistEvent(persistentSessionId, userMessageEvent)

  const projectPathOverride =
    options?.projectPath ??
    (effectiveProjectId
      ? dependencies.resolveProjectPathForProject?.(effectiveProjectId)
      : undefined)

  const agentType = (agent?.config as { type?: string } | undefined)?.type
  const preset = getEffectivePreset(agentType, agent?.config, agent?.plugin_id ?? undefined)
  dependencies.stateMachine.setMetadata(persistentSessionId, {
    agent_preset_type: agentType ?? 'kombuse',
    permission_mode: preset.permissionMode ?? null,
    thinking_enabled: !!agent?.config?.anthropic?.thinking,
    thinking_budget: agent?.config?.anthropic?.thinking_budget ?? null,
  })

  let resolvedSystemPrompt: string | undefined
  if (options?.systemPromptOverride) {
    resolvedSystemPrompt = options.systemPromptOverride
  } else if (agent?.system_prompt) {
    const preambleContext = buildAgentTemplateContext({
      ticketId: ticketId ?? null,
      projectId: effectiveProjectId ?? null,
      kombuseSessionId: appSessionId,
      backendType: resolvedBackendType,
    })
    resolvedSystemPrompt = renderTemplateWithIncludes(agent.system_prompt, preambleContext, agent.plugin_id)
  }

  const effectiveProjectPath = projectPathOverride ?? dependencies.resolveProjectPath()

  if (!effectiveProjectPath || !existsSync(effectiveProjectPath)) {
    const errorMsg = effectiveProjectPath
      ? `Project directory does not exist: ${effectiveProjectPath}`
      : 'No valid project directory configured'
    handleRuntimeRunFailure({
      dependencies,
      emit,
      logger,
      backend,
      persistentSessionId,
      appSessionId,
      ticketId,
      ticketNumber,
      projectId: effectiveProjectId,
      continuationInvocationId,
      messageText: errorMsg,
    })
    return
  }

  const agentsMdContent = readAgentsMd(effectiveProjectPath)
  if (agentsMdContent) {
    const agentsMdSection = `<project-instructions>\n${agentsMdContent}\n</project-instructions>`
    resolvedSystemPrompt = resolvedSystemPrompt
      ? `${agentsMdSection}\n\n<agent-instructions>\n${resolvedSystemPrompt}\n</agent-instructions>`
      : agentsMdSection
  }

  if (resolvedSystemPrompt) {
    const systemPromptEvent: AgentEvent = {
      type: 'raw',
      eventId: crypto.randomUUID(),
      backend: backend.name,
      timestamp: Date.now(),
      sourceType: 'system_prompt',
      data: { content: resolvedSystemPrompt },
    }
    dependencies.sessionPersistence.persistEvent(persistentSessionId, systemPromptEvent)
  }

  const allowedTools = presetToAllowedTools(preset)

  const restoredMetadata = dependencies.stateMachine.getMetadata(persistentSessionId)
  let didCallAddComment = restoredMetadata.didCallAddComment ?? false
  let lastAssistantMessage = restoredMetadata.lastAssistantMessage ?? ''
  let planCommentId = restoredMetadata.planCommentId
  let exitPlanModeToolUseId = restoredMetadata.exitPlanModeToolUseId

  setSessionTurnActive(appSessionId, true)
  runAgentChat(backend, userMessage, appSessionId, {
    projectPath: effectiveProjectPath,
    resumeSessionId,
    model: resolvedAppliedModel,
    systemPrompt: resolvedSystemPrompt,
    allowedTools,
    permissionMode: preset.permissionMode,
    onEvent: (event: AgentEvent) => {
      logger.logEvent(event)

      if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization') {
        dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
        return
      }
      if (event.type === 'lifecycle') {
        return
      }

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
          ticketNumber,
          projectId: effectiveProjectId,
          agentId: agent?.id,
          agentPluginId: agent?.plugin_id ?? undefined,
          logger,
          emit,
        })
        if (wasAutoApproved) {
          dependencies.sessionPersistence.persistEvent(persistentSessionId, { ...event, autoApproved: true })
          return
        }
      }

      dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
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

      if (!lastAssistantMessage.trim() && isSentryEnabled()) {
        Sentry.captureEvent({
          level: 'warning',
          message: 'Session completed with no assistant message output',
          extra: {
            sessionId: appSessionId,
            agentId: agent?.id,
            backendType: resolvedBackendType,
            ticketNumber,
            projectId: effectiveProjectId,
          },
        })
      }

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        backendSessionId: context.backendSessionId,
        ticketNumber,
        projectId: effectiveProjectId,
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
        ticketNumber,
        projectId: effectiveProjectId,
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
          `\n\n<prior-conversation>\n## Prior Conversation\nThe following is the conversation history from a previous session. Use this context to maintain continuity.\n\n${conversationHistory}\n</prior-conversation>`
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
        projectPath: effectiveProjectPath,
        systemPrompt: fallbackSystemPrompt,
        allowedTools,
        permissionMode: preset.permissionMode,
        onEvent: (event: AgentEvent) => {
          logger.logEvent(event)

          if (event.type === 'raw' && event.sourceType === 'cli_pre_normalization') {
            dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
            return
          }
          if (event.type === 'lifecycle') {
            return
          }

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
              ticketNumber,
              projectId: effectiveProjectId,
              agentId: agent?.id,
              agentPluginId: agent?.plugin_id ?? undefined,
              logger,
              emit,
            })
            if (wasAutoApproved) {
              dependencies.sessionPersistence.persistEvent(persistentSessionId, { ...event, autoApproved: true })
              return
            }
          }

          dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
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

          if (!lastAssistantMessage.trim() && isSentryEnabled()) {
            Sentry.captureEvent({
              level: 'warning',
              message: 'Session completed with no assistant message output',
              extra: {
                sessionId: appSessionId,
                agentId: agent?.id,
                backendType: resolvedBackendType,
                ticketNumber,
                projectId: effectiveProjectId,
              },
            })
          }

          emit({
            type: 'complete',
            kombuseSessionId: appSessionId,
            backendSessionId: context.backendSessionId,
            ticketNumber,
            projectId: effectiveProjectId,
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
            ticketNumber,
            projectId: effectiveProjectId,
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
            ticketNumber,
            projectId: effectiveProjectId,
            continuationInvocationId,
            messageText: error.message,
          })
        },
      }, images).catch((retryError: unknown) => {
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
          ticketNumber,
          projectId: effectiveProjectId,
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
        ticketNumber,
        projectId: effectiveProjectId,
        continuationInvocationId,
        messageText: error.message,
      })
    },
  }, images).catch((error: unknown) => {
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
      ticketNumber,
      projectId: effectiveProjectId,
      status: 'failed',
      reason: failureReason,
      errorMessage: messageText,
    })

    if (ticketId) {
      broadcastTicketAgentStatus(ticketId)
    }
  })
}
