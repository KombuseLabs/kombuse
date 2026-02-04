import { statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import {
  ClaudeCodeBackend,
  createAgentRunner,
  runAgentChat,
} from '@kombuse/agent'
import {
  agentService,
  projectService,
  sessionPersistenceService,
  type ISessionPersistenceService,
} from '@kombuse/services'
import type {
  AgentBackend,
  AgentEvent,
  AgentRunner,
  ClientMessage,
  Event,
} from '@kombuse/types'

type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>

export type AgentExecutionEvent =
  | { type: 'started'; kombuseSessionId: string }
  | { type: 'event'; kombuseSessionId: string; event: AgentEvent }
  | {
      type: 'complete'
      kombuseSessionId: string
      backendSessionId?: string
    }
  | { type: 'error'; message: string }

interface ProcessEventOptions {
  onRunnerLog?: (message: string) => void
}

/**
 * This service intentionally exposes two entry points:
 * - `processEventAndRunAgents`: system/event-triggered execution that uses
 *   invocation records from `agentService.processEvent(...)`.
 * - `startAgentChatSession`: user-initiated websocket chat execution that
 *   streams directly to the client and is not persisted as an invocation.
 *
 * They remain distinct at the boundary, but share runtime/backend orchestration
 * here to avoid behavior drift.
 */
interface AgentExecutionDependencies {
  getAgent: (agentId: string) => ReturnType<typeof agentService.getAgent>
  processEvent: (event: Event) => ReturnType<typeof agentService.processEvent>
  runInvocation: (
    invocationId: number,
    runner: AgentRunner
  ) => ReturnType<typeof agentService.runAgent>
  createBackend: () => AgentBackend
  createRunner: (onLog?: (message: string) => void) => AgentRunner
  runChat: typeof runAgentChat
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

/**
 * Server-standard runner for event-triggered invocations.
 */
export function createServerAgentRunner(
  onLog?: (message: string) => void
): AgentRunner {
  return createAgentRunner(createServerAgentBackend, {
    onLog,
    resolveProjectPath: resolveInvocationProjectPath,
    fallbackProjectPath: process.cwd(),
  })
}

const defaultDependencies: AgentExecutionDependencies = {
  getAgent: (agentId) => agentService.getAgent(agentId),
  processEvent: (event) => agentService.processEvent(event),
  runInvocation: (invocationId, runner) => agentService.runAgent(invocationId, runner),
  createBackend: createServerAgentBackend,
  createRunner: createServerAgentRunner,
  runChat: runAgentChat,
  generateSessionId: () => crypto.randomUUID(),
  resolveProjectPath: () => process.cwd(),
  sessionPersistence: sessionPersistenceService,
}

function resolveInvocationProjectPath(
  projectId: string | null
): string | undefined {
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
 * Process a domain event by creating and running matching invocations.
 */
export async function processEventAndRunAgents(
  event: Event,
  options: ProcessEventOptions = {},
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
    `[Server] Created ${invocations.length} invocation(s), running agents...`
  )

  const runner = dependencies.createRunner(options.onRunnerLog ?? console.log)

  for (const invocation of invocations) {
    try {
      await dependencies.runInvocation(invocation.id, runner)
    } catch (error) {
      console.error(
        `[Server] Failed to run invocation #${invocation.id}:`,
        error
      )
    }
  }
}

/**
 * Start a chat session initiated by a user websocket request.
 */
export function startAgentChatSession(
  message: AgentInvokeMessage,
  emit: (event: AgentExecutionEvent) => void,
  dependencies: AgentExecutionDependencies = defaultDependencies
): void {
  const { agentId, message: userMessage, kombuseSessionId } = message

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

  dependencies
    .runChat(backend, userMessage, appSessionId, {
      projectPath: dependencies.resolveProjectPath(),
      resumeSessionId,
      systemPrompt: agent?.system_prompt,
      onEvent: (event) => {
        // Persist event to database
        dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

        // Emit to WebSocket
        emit({
          type: 'event',
          kombuseSessionId: appSessionId,
          event,
        })
      },
      onComplete: (context) => {
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
      onError: (error) => {
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
    })
    .catch((error) => {
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
