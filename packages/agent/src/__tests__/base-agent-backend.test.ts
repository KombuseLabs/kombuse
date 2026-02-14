import { describe, expect, it } from 'vitest'
import { BACKEND_TYPES, type AgentCompleteEvent, type AgentEvent } from '../types'
import { BaseAgentBackend } from '../backends/base-agent-backend'

class TestBackend extends BaseAgentBackend {
  readonly name = BACKEND_TYPES.MOCK

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  send(): void {}

  beginStart(): void {
    this.starting()
  }

  markStarted(): void {
    this.started()
  }

  beginStop(reason?: string): void {
    this.stopping(reason)
  }

  markStopped(complete?: Omit<AgentCompleteEvent, 'type' | 'eventId' | 'backend' | 'timestamp'>): void {
    this.stopped({
      reason: complete?.reason,
      complete: complete ?? null,
    })
  }

  markFailed(message: string): void {
    this.failed(message)
  }
}

function lifecycleStates(events: AgentEvent[]): string[] {
  return events
    .filter((event): event is Extract<AgentEvent, { type: 'lifecycle' }> => event.type === 'lifecycle')
    .map((event) => event.state)
}

function completeReasons(events: AgentEvent[]): string[] {
  return events
    .filter((event): event is Extract<AgentEvent, { type: 'complete' }> => event.type === 'complete')
    .map((event) => event.reason)
}

describe('BaseAgentBackend', () => {
  it('emits lifecycle transitions in order for start/stop', () => {
    const backend = new TestBackend()
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    backend.beginStart()
    backend.markStarted()
    backend.beginStop('user_stop')
    backend.markStopped({
      reason: 'stopped',
      sessionId: 'session-1',
      success: false,
      errorMessage: 'Stopped by user',
    })

    expect(lifecycleStates(events)).toEqual(['starting', 'running', 'stopping', 'stopped'])
    expect(completeReasons(events)).toEqual(['stopped'])
  })

  it('ignores invalid lifecycle transitions', () => {
    const backend = new TestBackend()
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    backend.markStarted()
    backend.markStopped({
      reason: 'stopped',
      sessionId: 'session-1',
      success: false,
    })

    expect(lifecycleStates(events)).toEqual([])
    expect(completeReasons(events)).toEqual([])
    expect(backend.isRunning()).toBe(false)
  })

  it('emits terminal complete only once for repeated stop signals', () => {
    const backend = new TestBackend()
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    backend.beginStart()
    backend.markStarted()
    backend.beginStop('user_stop')
    backend.markStopped({
      reason: 'stopped',
      sessionId: 'session-1',
      success: false,
      errorMessage: 'Stopped by user',
    })
    backend.markStopped({
      reason: 'process_exit',
      sessionId: 'session-1',
      success: false,
      errorMessage: 'Process exited',
    })

    expect(completeReasons(events)).toEqual(['stopped'])
  })

  it('emits failed lifecycle, error, and failed completion', () => {
    const backend = new TestBackend()
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    backend.beginStart()
    backend.markStarted()
    backend.markFailed('boom')

    expect(lifecycleStates(events)).toEqual(['starting', 'running', 'failed'])
    expect(events.some((event) => event.type === 'error')).toBe(true)
    expect(completeReasons(events)).toEqual(['failed'])
  })
})
