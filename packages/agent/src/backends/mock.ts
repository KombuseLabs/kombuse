import { BACKEND_TYPES, type StartOptions } from '../types'
import { BaseAgentBackend } from './base-agent-backend'

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
export class MockAgentClient extends BaseAgentBackend {
  readonly name = BACKEND_TYPES.MOCK

  private abortController: AbortController | null = null
  private options: Required<MockClientOptions>

  constructor(options: MockClientOptions = {}) {
    super()
    this.options = {
      messageDelayMs: options.messageDelayMs ?? 1000,
      messageCount: options.messageCount ?? 3,
    }
  }

  async start(options: StartOptions): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Mock client is already running')
    }

    this.starting()
    this.clearBackendSessionId()
    this.abortController = new AbortController()
    this.started()

    // Start simulation loop in background
    this.runSimulation(options)
  }

  async stop(): Promise<void> {
    const lifecycleState = this.getLifecycleState()
    if (lifecycleState === 'stopped' || lifecycleState === 'failed' || lifecycleState === 'stopping') {
      return
    }

    this.stopping('user_stop')
    this.abortController?.abort()
    this.abortController = null
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

  send(message: string): void {
    if (!this.isRunning()) {
      throw new Error('Cannot send message: mock client is not running')
    }

    // Simulate receiving a message and responding
    setTimeout(() => {
      if (this.isRunning()) {
        this.emitEvent({
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

  private async runSimulation(options: StartOptions): Promise<void> {
    const signal = this.abortController?.signal

    try {
      // Emit initial message if provided
      if (options.initialMessage) {
        this.emitEvent({
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

        this.emitEvent({
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
        this.stopping('mock_complete')
        this.emitComplete({
          reason: 'mock_complete',
          sessionId: this.getBackendSessionId(),
          success: true,
        })
        this.stopped({ reason: 'mock_complete', complete: null })
      }
    } catch (error) {
      if (!signal?.aborted) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.failed(err.message, {
          reason: 'mock_error',
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
