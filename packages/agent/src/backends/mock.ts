import { BACKEND_TYPES, type AgentBackend, type AgentEvent, type StartOptions } from '../types'

export interface MockClientOptions {
  /** Delay between simulated messages in ms (default: 1000) */
  messageDelayMs?: number
  /** Number of messages to emit before completing (default: 3) */
  messageCount?: number
}

/**
 * Mock agent client for testing and development.
 * Simulates an agent by sleeping and emitting periodic message events.
 */
export class MockAgentClient implements AgentBackend {
  readonly name = BACKEND_TYPES.MOCK

  private running = false
  private backendSessionId: string | undefined
  private subscribers = new Set<(event: AgentEvent) => void>()
  private abortController: AbortController | null = null
  private options: Required<MockClientOptions>

  constructor(options: MockClientOptions = {}) {
    this.options = {
      messageDelayMs: options.messageDelayMs ?? 1000,
      messageCount: options.messageCount ?? 3,
    }
  }

  async start(options: StartOptions): Promise<void> {
    if (this.running) {
      throw new Error('Mock client is already running')
    }

    this.running = true
    // Mock backend has no provider-native session ID.
    this.backendSessionId = undefined
    this.abortController = new AbortController()

    // Start simulation loop in background
    this.runSimulation(options)
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    this.abortController?.abort()
    this.running = false
    this.emit({
      type: 'complete',
      eventId: crypto.randomUUID(),
      backend: this.name,
      timestamp: Date.now(),
      reason: 'mock_complete',
      success: true,
    })
  }

  send(message: string): void {
    if (!this.running) {
      throw new Error('Cannot send message: mock client is not running')
    }

    // Simulate receiving a message and responding
    setTimeout(() => {
      if (this.running) {
        this.emit({
          type: 'message',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          role: 'assistant',
          content: `Mock response to: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`,
        })
      }
    }, this.options.messageDelayMs)
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

  private emit(event: AgentEvent): void {
    for (const handler of this.subscribers) {
      try {
        handler(event)
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private async runSimulation(options: StartOptions): Promise<void> {
    const signal = this.abortController?.signal

    try {
      // Emit initial message if provided
      if (options.initialMessage) {
        this.emit({
          type: 'message',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          role: 'assistant',
          content: `Processing: "${options.initialMessage}"`,
        })
      }

      // Simulate work by emitting periodic messages
      for (let i = 0; i < this.options.messageCount; i++) {
        await this.sleep(this.options.messageDelayMs, signal)

        if (signal?.aborted) {
          return
        }

        this.emit({
          type: 'message',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          role: 'assistant',
          content: `Mock agent working... (step ${i + 1}/${this.options.messageCount})`,
        })
      }

      // Emit completion
      if (!signal?.aborted) {
        this.running = false
        this.emit({
          type: 'complete',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          reason: 'mock_complete',
          success: true,
        })
      }
    } catch (error) {
      if (!signal?.aborted) {
        this.running = false
        const err = error instanceof Error ? error : new Error(String(error))
        this.emit({
          type: 'error',
          eventId: crypto.randomUUID(),
          backend: this.name,
          timestamp: Date.now(),
          message: err.message,
          error: err,
        })
      }
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms)

      signal?.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new Error('Aborted'))
      })
    })
  }
}
