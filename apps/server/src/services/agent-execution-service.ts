import { statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { ClaudeCodeBackend } from '@kombuse/agent'
import {
  agentService,
  projectService,
  sessionPersistenceService,
  type ISessionPersistenceService,
} from '@kombuse/services'
import { agentInvocationsRepository } from '@kombuse/persistence'
import { wsHub } from '../websocket/hub'
import { serializeAgentStreamEvent } from '../websocket/serialize-agent-event'
import type {
  AgentBackend,
  AgentEvent,
  ClientMessage,
  ConversationContext,
  Event,
} from '@kombuse/types'

type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>
type PermissionResponseMessage = Extract<ClientMessage, { type: 'permission.response' }>

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
  /** Callback for each agent event */
  onEvent: (event: AgentEvent) => void
  /** Callback when complete, receives backend session context if available */
  onComplete?: (context: ConversationContext) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

/**
 * Run a chat message through an agent backend.
 * Returns immediately after starting - events come via callbacks.
 */
async function runAgentChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: string,
  options: ChatRunnerOptions
): Promise<ConversationContext> {
  if (!kombuseSessionId.trim()) {
    throw new Error('kombuseSessionId must be a non-empty string')
  }

  const appSessionId = kombuseSessionId
  let didComplete = false

  const finalize = () => {
    unsubscribe()
    if (backend.isRunning()) {
      void backend.stop().catch((stopError) => {
        options.onError?.(
          stopError instanceof Error ? stopError : new Error(String(stopError))
        )
      })
    }
  }

  // Subscribe to events
  const unsubscribe = backend.subscribe((evt) => {
    if (didComplete) {
      return
    }

    if (evt.type === 'complete') {
      didComplete = true
      const backendSessionId = backend.getBackendSessionId()
      const context: ConversationContext = {
        kombuseSessionId: appSessionId,
        backendSessionId,
      }
      options.onComplete?.(context)
      finalize()
    } else if (evt.type === 'error') {
      options.onEvent(evt)

      // Some backends may terminate with an error but without emitting complete.
      if (!backend.isRunning()) {
        didComplete = true
        options.onComplete?.({
          kombuseSessionId: appSessionId,
          backendSessionId: backend.getBackendSessionId(),
        })
        finalize()
      }
    } else {
      options.onEvent(evt)
    }
  })

  // Start the backend
  await backend.start({
    kombuseSessionId: appSessionId,
    resumeSessionId: options.resumeSessionId,
    projectPath: options.projectPath,
    systemPrompt: options.systemPrompt,
    initialMessage: message,
  })

  return {
    kombuseSessionId: appSessionId,
    backendSessionId: backend.getBackendSessionId(),
  }
}

/**
 * Registry of active session backends for permission response routing.
 */
const activeBackends = new Map<string, AgentBackend>()

/**
 * Register a backend for permission response routing.
 */
function registerBackend(sessionId: string, backend: AgentBackend): void {
  activeBackends.set(sessionId, backend)
}

/**
 * Unregister a backend.
 */
function unregisterBackend(sessionId: string): void {
  activeBackends.delete(sessionId)
}

/**
 * Broadcast a permission request to all clients.
 */
function broadcastPermissionPending(
  sessionId: string,
  event: Extract<AgentEvent, { type: 'permission_request' }>
): void {
  console.log('[server] permission_request:', event.requestId, event.toolName)
  wsHub.broadcastToTopic('*', {
    type: 'agent.permission_pending',
    sessionId,
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
  })
}

export type AgentExecutionEvent =
  | { type: 'started'; kombuseSessionId: string }
  | { type: 'event'; kombuseSessionId: string; event: AgentEvent }
  | {
      type: 'complete'
      kombuseSessionId: string
      backendSessionId?: string
    }
  | { type: 'error'; message: string }

/**
 * Dependencies for agent execution (injectable for testing).
 *
 * Both `processEventAndRunAgents` (trigger-initiated) and `startAgentChatSession`
 * (user-initiated) now use the same chat infrastructure, ensuring consistent
 * persistence, streaming, and permission handling.
 */
interface AgentExecutionDependencies {
  getAgent: (agentId: string) => ReturnType<typeof agentService.getAgent>
  processEvent: (event: Event) => ReturnType<typeof agentService.processEvent>
  createBackend: () => AgentBackend
  generateSessionId: () => string
  resolveProjectPath: () => string
  sessionPersistence: ISessionPersistenceService
}

/**
 * Server-standard backend factory for all agent execution paths.
 */
export function createServerAgentBackend(): AgentBackend {
  return new ClaudeCodeBackend()
}

const defaultDependencies: AgentExecutionDependencies = {
  getAgent: (agentId) => agentService.getAgent(agentId),
  processEvent: (event) => agentService.processEvent(event),
  createBackend: createServerAgentBackend,
  generateSessionId: () => crypto.randomUUID(),
  resolveProjectPath: () => process.cwd(),
  sessionPersistence: sessionPersistenceService,
}

/**
 * Build an initial message for a triggered agent from the event context.
 */
function buildTriggerMessage(event: Event): string {
  const lines = [
    `Event: ${event.event_type}`,
    `Ticket: #${event.ticket_id ?? 'N/A'}`,
    `Project: ${event.project_id ?? 'N/A'}`,
    '',
    'Payload:',
    JSON.stringify(event.payload, null, 2),
  ]
  return lines.join('\n')
}

/**
 * Resolve a project local path if available (used for triggered invocations).
 */
function resolveProjectPathForProject(projectId: string | null): string | undefined {
  if (!projectId) {
    return undefined
  }

  const project = projectService.get(projectId)
  const localPath = project?.local_path?.trim()

  if (!localPath) {
    return undefined
  }

  const candidatePath = resolvePath(localPath)

  try {
    if (statSync(candidatePath).isDirectory()) {
      return candidatePath
    }

    console.warn(
      `[Server] Project ${projectId} local_path is not a directory: ${candidatePath}`
    )
  } catch {
    console.warn(
      `[Server] Project ${projectId} local_path does not exist: ${candidatePath}`
    )
  }

  return undefined
}

/**
 * Process a domain event by creating invocations and running them via chat infrastructure.
 * This ensures triggered agents have the same persistence, streaming, and permission handling as chat agents.
 */
export async function processEventAndRunAgents(
  event: Event,
  dependencies: AgentExecutionDependencies = defaultDependencies
): Promise<void> {
  console.log(
    `[Server] Processing event #${event.id} (${event.event_type}) for agent triggers...`
  )
  const invocations = dependencies.processEvent(event)

  if (invocations.length === 0) {
    return
  }

  console.log(
    `[Server] Created ${invocations.length} invocation(s), running agents via chat infrastructure...`
  )

  for (const invocation of invocations) {
    const agent = dependencies.getAgent(invocation.agent_id)
    if (!agent) {
      console.warn(`[Server] Agent ${invocation.agent_id} not found for invocation #${invocation.id}`)
      continue
    }

    if (invocation.attempts >= invocation.max_attempts) {
      const errorMessage = `Invocation exceeded max attempts (${invocation.max_attempts})`
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      continue
    }

    // Generate session ID from invocation for easy lookup
    const kombuseSessionId = `invocation-${invocation.id}`

    // Update invocation with session ID
    agentInvocationsRepository.update(invocation.id, {
      kombuse_session_id: kombuseSessionId,
      status: 'running',
      attempts: invocation.attempts + 1,
      started_at: new Date().toISOString(),
      error: null,
    })

    // Build initial message from event
    const initialMessage = buildTriggerMessage(event)
    const projectPathOverride =
      resolveProjectPathForProject(event.project_id ?? null) ??
      dependencies.resolveProjectPath()

    let invocationFailed = false
    const markFailed = (message?: string) => {
      invocationFailed = true
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: message ?? 'Agent invocation failed',
        completed_at: new Date().toISOString(),
      })
    }

    // Use the same chat infrastructure as user-initiated sessions
    // Emit to broadcast topic so triggered sessions can be monitored
    startAgentChatSession(
      {
        type: 'agent.invoke',
        agentId: agent.id,
        message: initialMessage,
        kombuseSessionId,
      },
      (evt) => {
        // Broadcast to all clients (triggered sessions don't have a specific client)
        if (evt.type === 'event') {
          if (evt.event.type === 'error') {
            markFailed(evt.event.message)
          }
          const serialized = serializeAgentStreamEvent(evt.event)
          if (serialized) {
            wsHub.broadcastToTopic('*', {
              type: 'agent.event',
              kombuseSessionId: evt.kombuseSessionId,
              event: serialized,
            })
          }
        } else if (evt.type === 'complete') {
          if (!invocationFailed) {
            // Update invocation status
            agentInvocationsRepository.update(invocation.id, {
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
          }
          wsHub.broadcastToTopic('*', {
            type: 'agent.complete',
            kombuseSessionId: evt.kombuseSessionId,
            backendSessionId: evt.backendSessionId,
          })
        } else if (evt.type === 'error') {
          markFailed(evt.message)
        }
      },
      dependencies,
      { projectPath: projectPathOverride }
    )
  }
}

/**
 * Start a chat session initiated by a user websocket request.
 */
export function startAgentChatSession(
  message: AgentInvokeMessage,
  emit: (event: AgentExecutionEvent) => void,
  dependencies: AgentExecutionDependencies = defaultDependencies,
  options?: { projectPath?: string }
): void {
  const { agentId, message: userMessage, kombuseSessionId, projectId } = message

  const normalizedAgentId =
    typeof agentId === 'string' && agentId.trim().length > 0
      ? agentId.trim()
      : undefined
  const agent = normalizedAgentId
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

  const appSessionId =
    typeof kombuseSessionId === 'string' && kombuseSessionId.trim().length > 0
      ? kombuseSessionId
      : dependencies.generateSessionId()

  // Create/get persistent session record
  const persistentSessionId = dependencies.sessionPersistence.ensureSession(
    appSessionId,
    'claude-code'
  )
  const existingSession = dependencies.sessionPersistence.getSession(
    persistentSessionId
  )
  const resumeSessionId =
    typeof existingSession?.backend_session_id === 'string' &&
    existingSession.backend_session_id.trim().length > 0
      ? existingSession.backend_session_id.trim()
      : undefined

  dependencies.sessionPersistence.markSessionRunning(persistentSessionId)

  emit({
    type: 'started',
    kombuseSessionId: appSessionId,
  })

  // Persist user message before running agent
  const userMessageEvent: AgentEvent = {
    type: 'message',
    backend: 'claude-code',
    timestamp: Date.now(),
    role: 'user',
    content: userMessage,
  }
  dependencies.sessionPersistence.persistEvent(persistentSessionId, userMessageEvent)

  const backend = dependencies.createBackend()

  // Register backend for permission response routing
  registerBackend(appSessionId, backend)

  const projectPathOverride =
    options?.projectPath ??
    (typeof projectId === 'string' && projectId.trim().length > 0
      ? resolveProjectPathForProject(projectId.trim())
      : undefined)

  runAgentChat(backend, userMessage, appSessionId, {
    projectPath: projectPathOverride ?? dependencies.resolveProjectPath(),
    resumeSessionId,
    systemPrompt: agent?.system_prompt,
    onEvent: (event: AgentEvent) => {
      // Persist event to database
      dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

      // Emit to WebSocket
      emit({
        type: 'event',
        kombuseSessionId: appSessionId,
        event,
      })

      // Broadcast permission requests globally for the notification bell
      if (event.type === 'permission_request') {
        broadcastPermissionPending(appSessionId, event)
      }
    },
    onComplete: (context: ConversationContext) => {
      // Clean up backend registry
      unregisterBackend(appSessionId)

      // Mark session as completed
      dependencies.sessionPersistence.completeSession(
        persistentSessionId,
        context.backendSessionId
      )

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        backendSessionId: context.backendSessionId,
      })
    },
    onError: (error: Error) => {
      // Clean up backend registry
      unregisterBackend(appSessionId)

      // Persist error event
      const errorEvent: AgentEvent = {
        type: 'error',
        backend: backend.name,
        timestamp: Date.now(),
        message: error.message,
        error,
      }
      dependencies.sessionPersistence.persistEvent(
        persistentSessionId,
        errorEvent
      )

      // Mark session as failed
      dependencies.sessionPersistence.failSession(persistentSessionId)

      emit({
        type: 'event',
        kombuseSessionId: appSessionId,
        event: errorEvent,
      })

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
      })
    },
  }).catch((error: unknown) => {
      // Clean up backend registry
      unregisterBackend(appSessionId)

      const messageText =
        error instanceof Error ? error.message : String(error)

      // Mark session as failed on startup error
      dependencies.sessionPersistence.failSession(persistentSessionId)

      emit({
        type: 'error',
        message: `Failed to start agent: ${messageText}`,
      })
      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
      })
    })
}

/**
 * Respond to a permission request for an active chat session.
 */
export function respondToPermission(message: PermissionResponseMessage): boolean {
  const { kombuseSessionId, requestId, behavior, updatedInput, message: denyMessage } = message

  const backend = activeBackends.get(kombuseSessionId)
  if (!backend) {
    console.warn(`[Server] No active backend for session ${kombuseSessionId}`)
    return false
  }

  // Check if backend supports respondToPermission
  if (!('respondToPermission' in backend) || typeof backend.respondToPermission !== 'function') {
    console.warn(`[Server] Backend does not support respondToPermission`)
    return false
  }

  backend.respondToPermission(requestId, behavior, {
    updatedInput,
    message: denyMessage,
  })

  // Broadcast resolution so all clients can update their UI
  wsHub.broadcastToTopic('*', {
    type: 'agent.permission_resolved',
    sessionId: kombuseSessionId,
    requestId,
  })

  return true
}
