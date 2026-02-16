import type {
  AgentBackend,
  AgentBackendLifecycleState,
  AgentCompleteEvent,
  AgentEvent,
  BackendType,
  ImageAttachment,
  PermissionResponseOptions,
  StartOptions,
} from '../types'

interface LifecycleEventDetails {
  reason?: string
  errorMessage?: string
}

type CompletePayload = Omit<AgentCompleteEvent, 'type' | 'eventId' | 'backend' | 'timestamp'>

const LIFECYCLE_TRANSITIONS: Record<
  AgentBackendLifecycleState,
  AgentBackendLifecycleState[]
> = {
  starting: ['running', 'stopping', 'failed', 'stopped'],
  running: ['stopping', 'failed'],
  stopping: ['stopped', 'failed'],
  stopped: ['starting'],
  failed: ['starting', 'stopped'],
}

export abstract class BaseAgentBackend implements AgentBackend {
  abstract readonly name: BackendType

  private lifecycleState: AgentBackendLifecycleState = 'stopped'
  private backendSessionId: string | undefined
  private readonly subscribers = new Set<(event: AgentEvent) => void>()
  private terminalCompleteEmitted = false

  abstract start(options: StartOptions): Promise<void>
  abstract stop(): Promise<void>
  abstract send(message: string, images?: ImageAttachment[]): void

  respondToPermission?(
    _requestId: string,
    _behavior: 'allow' | 'deny',
    _options?: PermissionResponseOptions
  ): void

  listModels?(): Promise<unknown>

  subscribe(handler: (event: AgentEvent) => void): () => void {
    this.subscribers.add(handler)
    return () => {
      this.subscribers.delete(handler)
    }
  }

  isRunning(): boolean {
    return this.lifecycleState === 'running'
  }

  getBackendSessionId(): string | undefined {
    return this.backendSessionId
  }

  protected getLifecycleState(): AgentBackendLifecycleState {
    return this.lifecycleState
  }

  protected setBackendSessionId(sessionId: string | undefined): void {
    this.backendSessionId = sessionId
  }

  protected clearBackendSessionId(): void {
    this.backendSessionId = undefined
  }

  protected emitEvent(event: AgentEvent): void {
    for (const handler of this.subscribers) {
      try {
        handler(event)
      } catch {
        // Ignore subscriber errors to avoid crashing the backend.
      }
    }
  }

  protected emitComplete(payload: CompletePayload): void {
    this.emitEvent({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      ...payload,
    })
  }

  protected starting(): boolean {
    const transitioned = this.transitionLifecycle('starting')
    if (!transitioned) {
      return false
    }

    this.terminalCompleteEmitted = false
    this.emitLifecycle('starting')
    return true
  }

  protected started(sessionId?: string): boolean {
    if (sessionId !== undefined) {
      this.setBackendSessionId(sessionId)
    }

    const transitioned = this.transitionLifecycle('running')
    if (!transitioned) {
      return false
    }

    this.emitLifecycle('running')
    return true
  }

  protected stopping(reason?: string): boolean {
    const transitioned = this.transitionLifecycle('stopping')
    if (!transitioned) {
      return false
    }

    this.emitLifecycle('stopping', { reason })
    return true
  }

  protected stopped(options: { reason?: string; complete?: CompletePayload | null } = {}): boolean {
    const transitioned = this.transitionLifecycle('stopped')
    if (!transitioned) {
      return false
    }
    this.emitLifecycle('stopped', { reason: options.reason })

    if (options.complete === null) {
      return transitioned
    }

    const payload: CompletePayload = options.complete ?? {
      reason: 'stopped',
      sessionId: this.backendSessionId,
      success: false,
      ...(options.reason === 'user_stop' ? { errorMessage: 'Stopped by user' } : {}),
    }

    this.emitTerminalComplete(payload)
    return transitioned
  }

  protected failed(
    message: string,
    options: {
      reason?: string
      error?: Error
      raw?: unknown
      emitErrorEvent?: boolean
      completeReason?: AgentCompleteEvent['reason']
    } = {}
  ): boolean {
    const transitioned = this.transitionLifecycle('failed')
    if (transitioned) {
      this.emitLifecycle('failed', {
        reason: options.reason ?? 'backend_failed',
        errorMessage: message,
      })
    }

    if (options.emitErrorEvent !== false) {
      this.emitEvent({
        type: 'error',
        eventId: crypto.randomUUID(),
        backend: this.name,
        timestamp: Date.now(),
        message,
        error: options.error,
        raw: options.raw,
      })
    }

    this.emitTerminalComplete({
      reason: options.completeReason ?? 'failed',
      sessionId: this.backendSessionId,
      success: false,
      errorMessage: message,
      ...(options.raw !== undefined ? { raw: options.raw } : {}),
    })
    return transitioned
  }

  private emitLifecycle(
    state: AgentBackendLifecycleState,
    details: LifecycleEventDetails = {}
  ): void {
    this.emitEvent({
      type: 'lifecycle',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      state,
      ...details,
    })
  }

  private emitTerminalComplete(payload: CompletePayload): void {
    if (this.terminalCompleteEmitted) {
      return
    }
    this.terminalCompleteEmitted = true
    this.emitComplete(payload)
  }

  private transitionLifecycle(nextState: AgentBackendLifecycleState): boolean {
    if (this.lifecycleState === nextState) {
      return false
    }

    const allowed = LIFECYCLE_TRANSITIONS[this.lifecycleState]
    if (!allowed.includes(nextState)) {
      return false
    }

    this.lifecycleState = nextState
    return true
  }
}
