import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session, SessionStatus, SessionMetadata, KombuseSessionId } from '@kombuse/types'
import { SessionStateMachine, type StateMachineDeps, type TransitionContext } from '../session-state-machine'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    kombuse_session_id: 'chat-abc' as KombuseSessionId,
    backend_type: 'claude-code',
    backend_session_id: null,
    ticket_id: null,
    agent_id: null,
    status: 'pending',
    metadata: {},
    started_at: new Date().toISOString(),
    completed_at: null,
    failed_at: null,
    aborted_at: null,
    last_event_seq: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function createMockDeps(sessionOverrides: Partial<Session> = {}): StateMachineDeps {
  const session = makeSession(sessionOverrides)
  return {
    sessionPersistence: {
      getSession: vi.fn(() => session),
      markSessionRunning: vi.fn(),
      completeSession: vi.fn(),
      failSession: vi.fn(),
      abortSession: vi.fn(),
      updateStatus: vi.fn(),
      getMetadata: vi.fn(() => session.metadata),
      setMetadata: vi.fn((id: string, patch: Partial<SessionMetadata>) => {
        Object.assign(session.metadata, patch)
      }),
    },
    backends: {
      register: vi.fn(),
      unregister: vi.fn(),
      resetIdleTimeout: vi.fn(),
      clearIdleTimeout: vi.fn(),
    },
    invocations: {
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    },
  }
}

function baseCtx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return { kombuseSessionId: 'chat-abc', ...overrides }
}

describe('SessionStateMachine', () => {
  describe('valid transitions', () => {
    it('pending -> running via start', () => {
      const deps = createMockDeps({ status: 'pending' })
      const sm = new SessionStateMachine(deps)
      const mockBackend = { name: 'claude-code', isRunning: () => true }

      sm.transition('session-1', 'start', baseCtx({ backend: mockBackend, ticketId: 42 }))

      expect(deps.sessionPersistence.markSessionRunning).toHaveBeenCalledWith('session-1')
      expect(deps.backends.register).toHaveBeenCalledWith('chat-abc', mockBackend)
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('running -> completed via complete', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'complete', baseCtx({
        backendSessionId: 'backend-123',
        invocationId: 42,
      }))

      expect(deps.sessionPersistence.completeSession).toHaveBeenCalledWith('session-1', 'backend-123')
      expect(deps.invocations.markCompleted).toHaveBeenCalledWith(42)
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('running -> failed via fail', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'fail', baseCtx({
        error: 'something broke',
        invocationId: 42,
      }))

      expect(deps.sessionPersistence.failSession).toHaveBeenCalledWith('session-1', undefined)
      expect(deps.invocations.markFailed).toHaveBeenCalledWith(42, 'something broke')
      expect(deps.backends.unregister).toHaveBeenCalledWith('chat-abc')
      expect(deps.backends.clearIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('running -> failed via fail with backendSessionId', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'fail', baseCtx({
        backendSessionId: 'backend-456',
        error: 'something broke',
        invocationId: 42,
      }))

      expect(deps.sessionPersistence.failSession).toHaveBeenCalledWith('session-1', 'backend-456')
      expect(deps.invocations.markFailed).toHaveBeenCalledWith(42, 'something broke')
    })

    it('running -> aborted via abort', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'abort', baseCtx({ invocationId: 42 }))

      expect(deps.sessionPersistence.abortSession).toHaveBeenCalledWith('session-1', undefined)
      expect(deps.backends.unregister).toHaveBeenCalledWith('chat-abc')
      expect(deps.backends.clearIdleTimeout).toHaveBeenCalledWith('chat-abc')
      expect(deps.invocations.markFailed).toHaveBeenCalledWith(42, 'session_aborted')
    })

    it('running -> aborted via abort with backendSessionId', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'abort', baseCtx({
        backendSessionId: 'backend-789',
        invocationId: 42,
      }))

      expect(deps.sessionPersistence.abortSession).toHaveBeenCalledWith('session-1', 'backend-789')
      expect(deps.invocations.markFailed).toHaveBeenCalledWith(42, 'session_aborted')
    })

    it('pending -> aborted via abort', () => {
      const deps = createMockDeps({ status: 'pending' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'abort', baseCtx())

      expect(deps.sessionPersistence.abortSession).toHaveBeenCalledWith('session-1', undefined)
      expect(deps.backends.unregister).toHaveBeenCalledWith('chat-abc')
    })

    it('completed -> running via continue', () => {
      const deps = createMockDeps({ status: 'completed' })
      const sm = new SessionStateMachine(deps)
      const mockBackend = { name: 'claude-code', isRunning: () => true }

      sm.transition('session-1', 'continue', baseCtx({ backend: mockBackend }))

      expect(deps.sessionPersistence.markSessionRunning).toHaveBeenCalledWith('session-1')
      expect(deps.backends.register).toHaveBeenCalledWith('chat-abc', mockBackend)
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('failed -> running via continue', () => {
      const deps = createMockDeps({ status: 'failed' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'continue', baseCtx())

      expect(deps.sessionPersistence.markSessionRunning).toHaveBeenCalledWith('session-1')
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('completed -> stopped via stop', () => {
      const deps = createMockDeps({ status: 'completed' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'stop', baseCtx())

      expect(deps.sessionPersistence.updateStatus).toHaveBeenCalledWith('session-1', 'stopped')
      expect(deps.backends.unregister).toHaveBeenCalledWith('chat-abc')
      expect(deps.backends.clearIdleTimeout).toHaveBeenCalledWith('chat-abc')
    })

    it('running -> running via continue (no-op re-entry)', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'continue', baseCtx())

      // Should only reset idle timeout, not re-register or markRunning
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
      expect(deps.sessionPersistence.markSessionRunning).not.toHaveBeenCalled()
      expect(deps.backends.register).not.toHaveBeenCalled()
    })

    it('running -> running via continue re-registers backend when provided', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)
      const mockBackend = { name: 'claude-code', isRunning: () => true }

      sm.transition('session-1', 'continue', baseCtx({ backend: mockBackend }))

      expect(deps.backends.register).toHaveBeenCalledWith('chat-abc', mockBackend)
      expect(deps.backends.resetIdleTimeout).toHaveBeenCalledWith('chat-abc')
      expect(deps.sessionPersistence.markSessionRunning).not.toHaveBeenCalled()
    })
  })

  describe('invalid transitions', () => {
    const invalidCases: [SessionStatus, string][] = [
      ['completed', 'fail'],
      ['completed', 'complete'],
      ['aborted', 'start'],
      ['aborted', 'continue'],
      ['aborted', 'complete'],
      ['stopped', 'start'],
      ['stopped', 'continue'],
      ['stopped', 'complete'],
      ['pending', 'complete'],
      ['pending', 'fail'],
      ['pending', 'stop'],
      ['pending', 'continue'],
      ['failed', 'complete'],
      ['failed', 'stop'],
    ]

    for (const [from, event] of invalidCases) {
      it(`${from} -> ${event} throws`, () => {
        const deps = createMockDeps({ status: from })
        const sm = new SessionStateMachine(deps)

        expect(() => sm.transition('session-1', event as any, baseCtx())).toThrow(
          `Invalid transition: cannot apply '${event}' to session in '${from}' state`
        )
      })
    }
  })

  describe('session not found', () => {
    it('throws when session does not exist', () => {
      const deps = createMockDeps()
      deps.sessionPersistence.getSession = vi.fn(() => null)
      const sm = new SessionStateMachine(deps)

      expect(() => sm.transition('nonexistent', 'start', baseCtx())).toThrow(
        'Session nonexistent not found'
      )
    })
  })

  describe('metadata', () => {
    it('getMetadata delegates to sessionPersistence', () => {
      const deps = createMockDeps({ metadata: { planCommentId: 123 } })
      const sm = new SessionStateMachine(deps)

      const result = sm.getMetadata('session-1')
      expect(result).toEqual({ planCommentId: 123 })
      expect(deps.sessionPersistence.getMetadata).toHaveBeenCalledWith('session-1')
    })

    it('setMetadata delegates to sessionPersistence', () => {
      const deps = createMockDeps()
      const sm = new SessionStateMachine(deps)

      sm.setMetadata('session-1', { didCallAddComment: true })
      expect(deps.sessionPersistence.setMetadata).toHaveBeenCalledWith('session-1', { didCallAddComment: true })
    })

    it('applies metadataPatch during transition', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'complete', baseCtx({
        metadataPatch: { didCallAddComment: true },
      }))

      expect(deps.sessionPersistence.setMetadata).toHaveBeenCalledWith('session-1', { didCallAddComment: true })
    })

    it('does not call setMetadata when metadataPatch is undefined', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'complete', baseCtx())

      expect(deps.sessionPersistence.setMetadata).not.toHaveBeenCalled()
    })
  })

  describe('invocation handling', () => {
    it('complete without invocationId skips invocation update', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'complete', baseCtx())

      expect(deps.invocations.markCompleted).not.toHaveBeenCalled()
    })

    it('fail without invocationId skips invocation update', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'fail', baseCtx({ error: 'oops' }))

      expect(deps.invocations.markFailed).not.toHaveBeenCalled()
    })

    it('fail with default error message when error not provided', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'fail', baseCtx({ invocationId: 10 }))

      expect(deps.invocations.markFailed).toHaveBeenCalledWith(10, 'Unknown error')
    })

    it('abort maps to failed with session_aborted error', () => {
      const deps = createMockDeps({ status: 'running' })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'abort', baseCtx({ invocationId: 10 }))

      expect(deps.invocations.markFailed).toHaveBeenCalledWith(10, 'session_aborted')
    })
  })

  describe('side effect ordering', () => {
    it('start: DB update happens before backend registration', () => {
      const callOrder: string[] = []
      const deps = createMockDeps({ status: 'pending' })
      deps.sessionPersistence.markSessionRunning = vi.fn(() => { callOrder.push('db') })
      deps.backends.register = vi.fn(() => { callOrder.push('register') })
      deps.backends.resetIdleTimeout = vi.fn(() => { callOrder.push('timeout') })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'start', baseCtx({
        backend: { name: 'claude-code', isRunning: () => true },
      }))

      expect(callOrder).toEqual(['db', 'register', 'timeout'])
    })

    it('fail: DB update happens before backend unregistration', () => {
      const callOrder: string[] = []
      const deps = createMockDeps({ status: 'running' })
      deps.sessionPersistence.failSession = vi.fn(() => { callOrder.push('db') })
      deps.backends.unregister = vi.fn(() => { callOrder.push('unregister') })
      const sm = new SessionStateMachine(deps)

      sm.transition('session-1', 'fail', baseCtx({ error: 'test' }))

      expect(callOrder[0]).toBe('db')
      expect(callOrder[1]).toBe('unregister')
    })
  })
})
