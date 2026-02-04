import type { AgentRunner } from '@kombuse/types'
import type {
  AgentBackend,
  AgentCompleteEvent,
  AgentEvent,
  ConversationContext,
} from './types'

export interface RunnerOptions {
  /** Callback for logging events as they occur */
  onLog?: (message: string) => void
  /** Callback for each agent event */
  onEvent?: (event: AgentEvent) => void
  /** App session ID for chat sessions (generated if not provided) */
  kombuseSessionId?: string
  /** Resolve an event project ID to a backend working directory */
  resolveProjectPath?: (projectId: string | null) => string | null | undefined
  /** Fallback working directory when project resolution fails */
  fallbackProjectPath?: string
}

export type BackendFactory = () => AgentBackend

/**
 * Create an AgentRunner from any AgentBackend.
 * This is the generic runner that works with MockAgentClient, ClaudeCodeBackend, etc.
 *
 * @param createBackend - Factory function that creates a fresh backend instance per invocation
 * @param options - Optional callbacks for logging and event handling
 */
export function createAgentRunner(
  createBackend: BackendFactory,
  options: RunnerOptions = {}
): AgentRunner {
  return async ({ agent, invocation, event }) => {
    const backend = createBackend()
    const logs: string[] = []
    let unsubscribeCompletion = () => {}

    const requestedSessionId =
      options.kombuseSessionId ?? invocation.session_id ?? `invocation-${invocation.id}`
    const kombuseSessionId =
      typeof requestedSessionId === 'string' && requestedSessionId.trim().length > 0
        ? requestedSessionId
        : `invocation-${invocation.id}`
    const fallbackProjectPath =
      typeof options.fallbackProjectPath === 'string' &&
      options.fallbackProjectPath.trim().length > 0
        ? options.fallbackProjectPath
        : process.cwd()
    const projectPath = resolveProjectPath(
      event.project_id ?? null,
      options,
      fallbackProjectPath
    )

    // Subscribe to events and log them
    const unsubscribe = backend.subscribe((evt) => {
      const timestamp = new Date().toISOString()
      const msg = formatEventLog(timestamp, agent.id, evt)
      logs.push(msg)
      options.onLog?.(msg)
      options.onEvent?.(evt)
    })

    try {
      let firstError: Error | undefined

      // Create a promise that resolves when the backend completes
      const completionPromise = new Promise<AgentCompleteEvent>((resolve) => {
        unsubscribeCompletion = backend.subscribe((evt) => {
          if (evt.type === 'complete') {
            unsubscribeCompletion()
            resolve(evt)
          } else if (evt.type === 'error') {
            firstError = evt.error ?? new Error(evt.message)

            // Some backends may terminate with an error but never emit complete.
            if (!backend.isRunning()) {
              unsubscribeCompletion()
              resolve({
                type: 'complete',
                backend: backend.name,
                timestamp: Date.now(),
                reason: 'process_exit',
                sessionId: backend.getBackendSessionId(),
                success: false,
              })
            }
          }
        })
      })

      // Start the backend
      await backend.start({
        kombuseSessionId,
        projectPath,
        initialMessage: buildInitialMessage(agent, event),
      })

      // Wait for completion
      const completion = await completionPromise
      const backendSessionId = backend.getBackendSessionId()
      const completionIndicatesFailure = completion.success === false
      const failureMessage =
        firstError?.message ??
        (completionIndicatesFailure ? 'Agent invocation failed' : undefined)

      return {
        result: {
          logs,
          event_type: event.event_type,
          ticket_id: event.ticket_id,
          message_count: logs.length,
          backend: backend.name,
          kombuse_session_id: kombuseSessionId,
          backend_session_id: backendSessionId,
          ...(failureMessage ? { error: failureMessage } : {}),
        },
        ...(failureMessage ? { error: failureMessage } : {}),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        result: { logs, error: errorMessage, backend: backend.name },
        error: errorMessage,
      }
    } finally {
      unsubscribe()
      unsubscribeCompletion()
      if (backend.isRunning()) {
        await backend.stop()
      }
    }
  }
}

function resolveProjectPath(
  projectId: string | null,
  options: RunnerOptions,
  fallbackProjectPath: string
): string {
  const resolvedProjectPath = options.resolveProjectPath?.(projectId)
  if (
    typeof resolvedProjectPath === 'string' &&
    resolvedProjectPath.trim().length > 0
  ) {
    return resolvedProjectPath
  }
  return fallbackProjectPath
}

function formatEventLog(timestamp: string, agentId: string, evt: AgentEvent): string {
  switch (evt.type) {
    case 'message':
      return `[${timestamp}] [${agentId}] message: ${evt.content}`
    case 'tool_use':
      return `[${timestamp}] [${agentId}] tool_use: ${evt.name}`
    case 'tool_result':
      return `[${timestamp}] [${agentId}] tool_result: ${evt.toolUseId}`
    case 'permission_request':
      return `[${timestamp}] [${agentId}] permission_request: ${evt.toolName}`
    case 'complete':
      return `[${timestamp}] [${agentId}] complete (${evt.reason})`
    case 'error':
      return `[${timestamp}] [${agentId}] error: ${evt.message}`
    case 'raw':
      return `[${timestamp}] [${agentId}] raw: ${evt.sourceType ?? 'unknown'}`
    default:
      return `[${timestamp}] [${agentId}] unknown event`
  }
}

function buildInitialMessage(
  _agent: { id: string; system_prompt?: string },
  event: { event_type: string; ticket_id?: number | null }
): string {
  // TODO: Build a richer initial message from agent config and event context
  return `Processing ${event.event_type} event (ticket: ${event.ticket_id ?? 'none'})`
}

/**
 * Options for running an agent chat session
 */
export interface ChatRunnerOptions {
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
 *
 * @param backend - The agent backend to use
 * @param message - The user's message
 * @param kombuseSessionId - Stable app session ID
 * @param options - Callbacks and configuration
 */
export async function runAgentChat(
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
