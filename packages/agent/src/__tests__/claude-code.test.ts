import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionId } from '@kombuse/types'
import { ClaudeCodeBackend } from '../backends/claude-code'
import type { ParsedClaudeMessage } from '../backends/claude-code'
import { type AgentEvent } from '../types'

describe('ClaudeCodeBackend', () => {
  describe('buildArgs', () => {
    it('includes --resume when resumeSessionId is provided', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        resumeSessionId: 'resume-session-id',
        projectPath: '/tmp',
      })

      expect(args).toContain('--resume')
      expect(args).toContain('resume-session-id')
    })

    it('includes --append-system-prompt when systemPrompt is provided', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        systemPrompt: 'You are a helpful agent.',
      })

      expect(args).toContain('--append-system-prompt')
      expect(args).toContain('You are a helpful agent.')
    })

    it('omits --append-system-prompt when systemPrompt is whitespace-only', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        systemPrompt: '  ',
      })

      expect(args).not.toContain('--append-system-prompt')
    })

    it('omits --append-system-prompt when systemPrompt is undefined', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
      })

      expect(args).not.toContain('--append-system-prompt')
    })

    it('includes --allowedTools when allowedTools is provided', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        allowedTools: ['Read', 'Grep', 'Glob', 'mcp__kombuse__get_ticket'],
      })

      expect(args).toContain('--allowedTools')
      expect(args).toContain('Read')
      expect(args).toContain('Grep')
      expect(args).toContain('Glob')
      expect(args).toContain('mcp__kombuse__get_ticket')
    })

    it('includes Bash patterns in --allowedTools', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        allowedTools: ['Read', 'Bash(npm *)'],
      })

      expect(args).toContain('--allowedTools')
      expect(args).toContain('Read')
      expect(args).toContain('Bash(npm *)')
    })

    it('omits --allowedTools when allowedTools is undefined', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
      })

      expect(args).not.toContain('--allowedTools')
    })

    it('omits --allowedTools when allowedTools is empty array', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        allowedTools: [],
      })

      expect(args).not.toContain('--allowedTools')
    })

    it('includes --permission-mode when permissionMode is plan', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        permissionMode: 'plan',
      })

      expect(args).toContain('--permission-mode')
      expect(args).toContain('plan')
    })

    it('omits --permission-mode when permissionMode is default', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        permissionMode: 'default',
      })

      expect(args).not.toContain('--permission-mode')
    })

    it('omits --permission-mode when permissionMode is undefined', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
      })

      expect(args).not.toContain('--permission-mode')
    })
  })

  describe('handleMessage', () => {
    let backend: ClaudeCodeBackend
    let events: AgentEvent[]

    beforeEach(() => {
      backend = new ClaudeCodeBackend()
      events = []
      backend.subscribe((evt) => events.push(evt))
    })

    // Access private method for testing
    const callHandleMessage = (backend: ClaudeCodeBackend, msg: ParsedClaudeMessage) => {
      // @ts-expect-error accessing private method for testing
      backend.handleMessage(msg)
    }

    it('should emit normalized message event for assistant text', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'assistant',
          uuid: 'test-uuid',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, I am Claude!' }]
          },
          parent_tool_use_id: null
        }
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(1)
      const evt = events[0]!
      expect(evt.type).toBe('message')
      expect(evt.backend).toBe('claude-code')
      if (evt.type === 'message') {
        expect(evt.content).toContain('Hello, I am Claude!')
      }
    })

    it('should emit complete event for result type and update session ID', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'success',
          uuid: 'test-uuid',
          session_id: 'session_abc',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: false,
          num_turns: 1,
          result: 'Success',
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          modelUsage: {},
          permission_denials: []
        }
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('complete')
      if (events[0]!.type === 'complete') {
        expect(events[0]!.success).toBe(true)
        expect(events[0]!.errorMessage).toBeUndefined()
      }
      expect(backend.getBackendSessionId()).toBe('session_abc')
    })

    it('should emit complete before error for failed result', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'test-uuid',
          session_id: 'session_err',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: true,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          modelUsage: {},
          permission_denials: [],
          errors: ['boom'],
        },
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(2)
      expect(events[0]!.type).toBe('complete')
      if (events[0]!.type === 'complete') {
        expect(events[0]!.success).toBe(false)
        expect(events[0]!.errorMessage).toBe('boom')
      }
      expect(events[1]!.type).toBe('error')
      expect(backend.getBackendSessionId()).toBe('session_err')
    })

    it('should emit raw event type as-is', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'raw',
          content: 'some raw output'
        }
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('raw')
      expect(events[0]!.backend).toBe('claude-code')
    })
  })
})
