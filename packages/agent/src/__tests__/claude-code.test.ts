import { describe, it, expect, beforeEach, vi } from 'vitest'
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

    it('includes --model when model is provided', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        model: 'claude-opus-4-6',
      })

      expect(args).toContain('--model')
      expect(args).toContain('claude-opus-4-6')
    })

    it('omits --model when model is undefined', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
      })

      expect(args).not.toContain('--model')
    })

    it('omits --model when model is whitespace-only', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        model: '  ',
      })

      expect(args).not.toContain('--model')
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

    it('omits --max-turns when maxTurns is undefined', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
      })

      expect(args).not.toContain('--max-turns')
    })

    it('includes --max-turns when maxTurns is provided', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        maxTurns: 10,
      })

      expect(args).toContain('--max-turns')
      expect(args).toContain('10')
    })

    it('includes --max-turns when maxTurns is 1', () => {
      const backend = new ClaudeCodeBackend()

      // @ts-expect-error accessing private method for testing
      const args = backend.buildArgs({
        kombuseSessionId: createSessionId('chat'),
        projectPath: '/tmp',
        maxTurns: 1,
      })

      expect(args).toContain('--max-turns')
      expect(args).toContain('1')
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

      expect(events).toHaveLength(2)
      expect(events[0]!.type).toBe('raw')
      const evt = events[1]!
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

      expect(events).toHaveLength(2)
      expect(events[0]!.type).toBe('raw')
      expect(events[1]!.type).toBe('complete')
      if (events[1]!.type === 'complete') {
        expect(events[1]!.success).toBe(true)
        expect(events[1]!.errorMessage).toBeUndefined()
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

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('raw')
      expect(events[1]!.type).toBe('complete')
      if (events[1]!.type === 'complete') {
        expect(events[1]!.success).toBe(false)
        expect(events[1]!.errorMessage).toBe('boom')
      }
      expect(events[2]!.type).toBe('error')
      expect(backend.getBackendSessionId()).toBe('session_err')
    })

    it('should use result field as error message for ClaudeResultSuccess with is_error: true', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'success',
          uuid: 'test-uuid',
          session_id: 'session_success_err',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: true,
          num_turns: 1,
          result: 'The agent encountered an error',
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          modelUsage: {},
          permission_denials: [],
        },
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('raw')
      expect(events[1]!.type).toBe('complete')
      if (events[1]!.type === 'complete') {
        expect(events[1]!.success).toBe(false)
        expect(events[1]!.errorMessage).toBe('The agent encountered an error')
      }
      expect(events[2]!.type).toBe('error')
    })

    it('should set resumeFailed when result error contains "session does not exist"', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'test-uuid',
          session_id: 'session_resume_fail',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: true,
          num_turns: 0,
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          errors: ['Session does not exist'],
        },
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('raw')
      const completeEvt = events[1]!
      expect(completeEvt.type).toBe('complete')
      if (completeEvt.type === 'complete') {
        expect(completeEvt.success).toBe(false)
        expect(completeEvt.resumeFailed).toBe(true)
      }
    })

    it('should set resumeFailed when result error contains "session id does not exist"', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'test-uuid',
          session_id: 'session_resume_fail',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: true,
          num_turns: 0,
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          errors: ['Session ID does not exist'],
        },
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('raw')
      const completeEvt = events[1]!
      expect(completeEvt.type).toBe('complete')
      if (completeEvt.type === 'complete') {
        expect(completeEvt.success).toBe(false)
        expect(completeEvt.resumeFailed).toBe(true)
      }
    })

    it('should not set resumeFailed for normal errors', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'test-uuid',
          session_id: 'session_normal_err',
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: true,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          modelUsage: {},
          permission_denials: [],
          errors: ['Some other error'],
        },
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('raw')
      const completeEvt = events[1]!
      expect(completeEvt.type).toBe('complete')
      if (completeEvt.type === 'complete') {
        expect(completeEvt.success).toBe(false)
        expect(completeEvt.resumeFailed).toBeUndefined()
      }
    })

    it('should emit raw event type as-is', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'raw',
          content: 'some raw output'
        }
      }

      callHandleMessage(backend, msg)

      expect(events).toHaveLength(2)
      expect(events[0]!.type).toBe('raw')
      expect(events[1]!.type).toBe('raw')
      expect(events[1]!.backend).toBe('claude-code')
    })

    it('should emit cli_pre_normalization raw event before normalized events', () => {
      const msg: ParsedClaudeMessage = {
        data: {
          type: 'assistant',
          uuid: 'test-uuid',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Test' }]
          },
          parent_tool_use_id: null
        }
      }

      callHandleMessage(backend, msg)

      expect(events.length).toBeGreaterThanOrEqual(2)
      const preNorm = events[0]!
      expect(preNorm.type).toBe('raw')
      if (preNorm.type === 'raw') {
        expect(preNorm.sourceType).toBe('cli_pre_normalization')
        expect(preNorm.data).toEqual(msg.data)
      }
    })
  })

  describe('send', () => {
    it('passes multimodal content to sendRaw when images are provided', () => {
      const backend = new ClaudeCodeBackend()
      const sendRawSpy = vi.fn()
      backend.sendRaw = sendRawSpy

      const images = [{ data: 'base64data', mediaType: 'image/png' }]
      backend.send('describe this image', images)

      expect(sendRawSpy).toHaveBeenCalledOnce()
      const payload = sendRawSpy.mock.calls[0]![0]
      expect(payload.type).toBe('user')
      expect(payload.message.role).toBe('user')

      const content = payload.message.content
      expect(Array.isArray(content)).toBe(true)
      expect(content).toHaveLength(2)
      expect(content[0]).toEqual({ type: 'text', text: 'describe this image' })
      expect(content[1]).toEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'base64data' },
      })
    })

    it('passes plain string to sendRaw when no images are provided', () => {
      const backend = new ClaudeCodeBackend()
      const sendRawSpy = vi.fn()
      backend.sendRaw = sendRawSpy

      backend.send('just text')

      expect(sendRawSpy).toHaveBeenCalledOnce()
      const payload = sendRawSpy.mock.calls[0]![0]
      expect(payload.type).toBe('user')
      expect(payload.message.role).toBe('user')
      expect(payload.message.content).toBe('just text')
    })
  })
})
