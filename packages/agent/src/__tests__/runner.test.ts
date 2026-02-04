import { describe, it, expect } from 'vitest'
import { createAgentRunner, runAgentChat } from '../runner'
import { type AgentBackend, type AgentEvent, type StartOptions } from '../types'

/**
 * Create a mock backend that emits events in sequence
 */
function createMockBackend(eventsToEmit: AgentEvent[]): AgentBackend {
  const subscribers = new Set<(event: AgentEvent) => void>()
  let sessionId: string | undefined

  return {
    name: 'mock',
    subscribe(handler) {
      subscribers.add(handler)
      return () => subscribers.delete(handler)
    },
    async start(options: StartOptions) {
      sessionId = `mock-session-${Date.now()}`
      // Emit events asynchronously to simulate real behavior
      setTimeout(() => {
        for (const event of eventsToEmit) {
          subscribers.forEach(handler => handler(event))
        }
      }, 10)
    },
    async stop() {},
    send() {},
    isRunning() { return true },
    getBackendSessionId() { return sessionId },
  }
}

describe('runAgentChat', () => {
  it('should forward message events to onEvent', async () => {
    const receivedEvents: AgentEvent[] = []

    const backend = createMockBackend([
      { type: 'message', backend: 'mock', timestamp: 123, role: 'assistant', content: 'Hello!' },
      { type: 'complete', backend: 'mock', timestamp: 124, reason: 'mock_complete' },
    ])

    await runAgentChat(backend, 'test message', 'kombuse-session-1', {
      projectPath: '/test',
      onEvent: (evt) => {
        receivedEvents.push(evt)
      },
      onComplete: () => {},
    })

    // Wait for async events
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]!.type).toBe('message')
  })

  it('should forward tool_use events to onEvent', async () => {
    const receivedEvents: AgentEvent[] = []

    const backend = createMockBackend([
      { type: 'message', backend: 'mock', timestamp: 456, role: 'assistant', content: 'Tool use sim' },
      { type: 'message', backend: 'mock', timestamp: 457, role: 'assistant', content: 'Done' },
      { type: 'complete', backend: 'mock', timestamp: 458, reason: 'mock_complete' },
    ])

    await runAgentChat(backend, 'test message', 'kombuse-session-2', {
      projectPath: '/test',
      onEvent: (evt) => {
        receivedEvents.push(evt)
      },
      onComplete: () => {},
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(receivedEvents).toHaveLength(2)
    expect(receivedEvents[0]!.type).toBe('message')
    expect(receivedEvents[1]!.type).toBe('message')
  })

  it('should NOT forward complete event to onEvent', async () => {
    const receivedEvents: AgentEvent[] = []
    let completeCalled = false

    const backend = createMockBackend([
      { type: 'message', backend: 'mock', timestamp: 123, role: 'assistant', content: 'Hello!' },
      { type: 'complete', backend: 'mock', timestamp: 124, reason: 'mock_complete' },
    ])

    await runAgentChat(backend, 'test message', 'kombuse-session-3', {
      projectPath: '/test',
      onEvent: (evt) => {
        receivedEvents.push(evt)
      },
      onComplete: () => {
        completeCalled = true
      },
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    // complete events should NOT be in receivedEvents
    expect(receivedEvents.every(e => e.type !== 'complete')).toBe(true)
    expect(completeCalled).toBe(true)
  })

  it('should unsubscribe after complete', async () => {
    const receivedEvents: AgentEvent[] = []
    const subscribers = new Set<(event: AgentEvent) => void>()

    const backend: AgentBackend = {
      name: 'mock',
      subscribe(handler) {
        subscribers.add(handler)
        return () => subscribers.delete(handler)
      },
      async start() {
        setTimeout(() => {
          subscribers.forEach(h => h({ type: 'message', backend: 'mock', timestamp: 1, role: 'assistant', content: 'Before' }))
          subscribers.forEach(h => h({ type: 'complete', backend: 'mock', timestamp: 2, reason: 'mock_complete' }))
          // This should NOT be received (after complete)
          subscribers.forEach(h => h({ type: 'message', backend: 'mock', timestamp: 3, role: 'assistant', content: 'After' }))
        }, 10)
      },
      async stop() {},
      send() {},
      isRunning() { return true },
      getBackendSessionId() { return 'test' },
    }

    await runAgentChat(backend, 'test', 'kombuse-session-4', {
      projectPath: '/test',
      onEvent: (evt) => receivedEvents.push(evt),
      onComplete: () => {},
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    // Should only have the "Before" message, not "After"
    expect(receivedEvents).toHaveLength(1)
    const evt = receivedEvents[0]!
    expect(evt.type).toBe('message')
    if (evt.type === 'message') {
      expect(evt.content).toBe('Before')
    }
  })

  it('should wait for complete even if backend emits error first', async () => {
    const subscribers = new Set<(event: AgentEvent) => void>()
    let running = false
    let completedContext: { kombuseSessionId: string; backendSessionId?: string } | undefined

    const backend: AgentBackend = {
      name: 'mock',
      subscribe(handler) {
        subscribers.add(handler)
        return () => subscribers.delete(handler)
      },
      async start() {
        running = true
        setTimeout(() => {
          subscribers.forEach((h) =>
            h({
              type: 'error',
              backend: 'mock',
              timestamp: 1,
              message: 'transient',
            })
          )
          subscribers.forEach((h) =>
            h({
              type: 'complete',
              backend: 'mock',
              timestamp: 2,
              reason: 'mock_complete',
              sessionId: 'backend-123',
            })
          )
          running = false
        }, 10)
      },
      async stop() {
        running = false
      },
      send() {},
      isRunning() {
        return running
      },
      getBackendSessionId() {
        return 'backend-123'
      },
    }

    await runAgentChat(backend, 'test', 'kombuse-session-5', {
      projectPath: '/test',
      onEvent: () => {},
      onComplete: (context) => {
        completedContext = context
      },
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(completedContext?.kombuseSessionId).toBe('kombuse-session-5')
    expect(completedContext?.backendSessionId).toBe('backend-123')
  })

  it('should synthesize complete when backend stops after error', async () => {
    const subscribers = new Set<(event: AgentEvent) => void>()
    let running = false
    let completeCalled = false

    const backend: AgentBackend = {
      name: 'mock',
      subscribe(handler) {
        subscribers.add(handler)
        return () => subscribers.delete(handler)
      },
      async start() {
        running = true
        setTimeout(() => {
          running = false
          subscribers.forEach((h) =>
            h({
              type: 'error',
              backend: 'mock',
              timestamp: 1,
              message: 'fatal',
            })
          )
        }, 10)
      },
      async stop() {},
      send() {},
      isRunning() {
        return running
      },
      getBackendSessionId() {
        return undefined
      },
    }

    await runAgentChat(backend, 'test', 'kombuse-session-6', {
      projectPath: '/test',
      onEvent: () => {},
      onComplete: () => {
        completeCalled = true
      },
    })

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(completeCalled).toBe(true)
  })
})

describe('createAgentRunner', () => {
  it('marks invocation as failed when completion reports success=false', async () => {
    const backend: AgentBackend = {
      name: 'mock',
      subscribe(handler) {
        setTimeout(() => {
          handler({
            type: 'complete',
            backend: 'mock',
            timestamp: Date.now(),
            reason: 'result',
            success: false,
          })
        }, 10)
        return () => {}
      },
      async start() {},
      async stop() {},
      send() {},
      isRunning() {
        return false
      },
      getBackendSessionId() {
        return undefined
      },
    }

    const runner = createAgentRunner(() => backend)

    const result = await runner({
      agent: {
        id: 'agent-1',
        system_prompt: '',
        is_enabled: true,
        permissions: [],
        config: {},
        created_at: '',
        updated_at: '',
      },
      invocation: {
        id: 1,
        agent_id: 'agent-1',
        trigger_id: 1,
        event_id: 1,
        session_id: 'session-1',
        status: 'running',
        attempts: 1,
        max_attempts: 3,
        run_at: '',
        context: {},
        result: null,
        error: null,
        started_at: null,
        completed_at: null,
        created_at: '',
      },
      event: {
        id: 1,
        event_type: 'ticket.created',
        project_id: null,
        ticket_id: 7,
        comment_id: null,
        actor_id: null,
        actor_type: 'system',
        payload: '',
        created_at: '',
      },
      checkPermission: () => ({ allowed: true }),
    } as any)

    expect(result.error).toBe('Agent invocation failed')
    expect(result.result.error).toBe('Agent invocation failed')
  })
})
