import { describe, it, expect } from 'vitest'
import type { AgentEvent, ServerMessage } from '@kombuse/types'
import { serializeAgentEvent, serializeAgentStreamEvent } from '../websocket/serialize-agent-event'

describe('WebSocket Agent Serialization', () => {
  describe('serializeAgentEvent', () => {
    it('should serialize message events directly', () => {
      const agentEvent: AgentEvent = {
        type: 'message',
        eventId: 'test-event-1',
        backend: 'mock',
        timestamp: 12345,
        role: 'assistant',
        content: 'Hello from Mock!',
      }

      const wireEvent = serializeAgentEvent(agentEvent)

      expect(wireEvent.type).toBe('message')
      if (wireEvent.type === 'message') {
        expect(wireEvent.content).toBe('Hello from Mock!')
        expect(wireEvent.timestamp).toBe(12345)
      }
    })

    it('should serialize tool use input as JSON-safe object', () => {
      const agentEvent: AgentEvent = {
        type: 'tool_use',
        eventId: 'test-event-2',
        backend: 'claude-code',
        timestamp: Date.now(),
        id: 'tool_1',
        name: 'write_file',
        input: { path: '/tmp/a.txt', retries: 2 },
      }

      const wireEvent = serializeAgentEvent(agentEvent)

      expect(wireEvent.type).toBe('tool_use')
      if (wireEvent.type === 'tool_use') {
        expect(wireEvent.input.path).toBe('/tmp/a.txt')
        expect(wireEvent.input.retries).toBe(2)
      }
    })

    it('should serialize errors into plain objects', () => {
      const agentEvent: AgentEvent = {
        type: 'error',
        eventId: 'test-event-3',
        backend: 'claude-code',
        timestamp: Date.now(),
        message: 'Something went wrong',
        error: new Error('boom'),
      }

      const wireEvent = serializeAgentEvent(agentEvent)

      expect(wireEvent.type).toBe('error')
      if (wireEvent.type === 'error') {
        expect(wireEvent.message).toBe('Something went wrong')
        expect(wireEvent.error?.name).toBe('Error')
        expect(wireEvent.error?.message).toBe('boom')
      }
    })

    it('should serialize raw circular payload safely', () => {
      const circular: Record<string, unknown> = { ok: true }
      circular.self = circular

      const agentEvent: AgentEvent = {
        type: 'raw',
        eventId: 'test-event-4',
        backend: 'claude-code',
        timestamp: Date.now(),
        data: circular,
      }

      const wireEvent = serializeAgentEvent(agentEvent)

      expect(wireEvent.type).toBe('raw')
      if (wireEvent.type === 'raw') {
        expect(wireEvent.data).toHaveProperty('ok', true)
        expect(wireEvent.data).toHaveProperty('self', '[Circular]')
      }
    })
  })

  describe('serializeAgentStreamEvent', () => {
    it('should skip complete events for agent.event stream', () => {
      const agentEvent: AgentEvent = {
        type: 'complete',
        eventId: 'test-event-5',
        backend: 'mock',
        timestamp: Date.now(),
        reason: 'mock_complete',
      }

      const streamEvent = serializeAgentStreamEvent(agentEvent)

      expect(streamEvent).toBeNull()
    })

    it('should skip lifecycle events for agent.event stream', () => {
      const agentEvent: AgentEvent = {
        type: 'lifecycle',
        eventId: 'test-event-6',
        backend: 'mock',
        timestamp: Date.now(),
        state: 'stopped',
        reason: 'user_stop',
      }

      const streamEvent = serializeAgentStreamEvent(agentEvent)

      expect(streamEvent).toBeNull()
    })
  })

  describe('ServerMessage format', () => {
    it('should create valid agent.event ServerMessage', () => {
      const agentEvent: AgentEvent = {
        type: 'message',
        eventId: 'test-event-6',
        backend: 'mock',
        timestamp: 999,
        role: 'assistant',
        content: 'Test message',
      }

      const streamEvent = serializeAgentStreamEvent(agentEvent)
      const convId = 'test-conv-123'

      expect(streamEvent).not.toBeNull()

      const serverMessage: ServerMessage = {
        type: 'agent.event',
        kombuseSessionId: convId,
        event: streamEvent!,
      }

      expect(serverMessage.type).toBe('agent.event')
      expect(serverMessage.kombuseSessionId).toBe(convId)
      expect(serverMessage.event.type).toBe('message')

      const json = JSON.stringify(serverMessage)
      const parsed = JSON.parse(json) as ServerMessage

      expect(parsed.type).toBe('agent.event')
      if (parsed.type === 'agent.event') {
        expect(parsed.event.type).toBe('message')
        if (parsed.event.type === 'message') {
          expect(parsed.event.content).toBe('Test message')
          expect(parsed.event.timestamp).toBe(999)
        }
      }
    })
  })
})
