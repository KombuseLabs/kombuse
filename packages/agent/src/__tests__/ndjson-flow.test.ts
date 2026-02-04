import { describe, it, expect } from 'vitest'
import { type AgentEvent } from '../types'

/**
 * Simulate the NDJSON parsing behavior from claude-code.ts
 */
function createNdjsonParser(onLine: (line: string) => void) {
  let buffer = ''

  return {
    feed(data: string) {
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.trim()) {
          onLine(line)
        }
      }
    },
    getBuffer() {
      return buffer
    },
  }
}

/**
 * Simulate normalized event parsing from Claude stream events
 */
function parseClaudeEvent(json: string): AgentEvent | null {
  const parsed = JSON.parse(json)

  switch (parsed.type) {
    case 'assistant': {
      const textBlock = parsed.message?.content?.find((block: { type: string; text?: string }) => block.type === 'text')
      if (!textBlock?.text) return null
      return {
        type: 'message',
        backend: 'claude-code',
        timestamp: Date.now(),
        role: 'assistant',
        content: textBlock.text,
        raw: parsed,
      }
    }

    case 'result':
      return {
        type: 'complete',
        backend: 'claude-code',
        timestamp: Date.now(),
        reason: 'result',
        sessionId: parsed.session_id,
        success: true,
        raw: parsed,
      }

    default:
      return null
  }
}

describe('NDJSON Flow', () => {
  describe('NDJSON Parser', () => {
    it('should parse complete lines', () => {
      const lines: string[] = []
      const parser = createNdjsonParser((line) => lines.push(line))

      parser.feed('{"type":"init"}\n{"type":"ready"}\n')

      expect(lines).toEqual(['{"type":"init"}', '{"type":"ready"}'])
    })

    it('should buffer incomplete lines', () => {
      const lines: string[] = []
      const parser = createNdjsonParser((line) => lines.push(line))

      parser.feed('{"type":"ass')
      expect(lines).toHaveLength(0)
      expect(parser.getBuffer()).toBe('{"type":"ass')

      parser.feed('istant"}\n')
      expect(lines).toEqual(['{"type":"assistant"}'])
      expect(parser.getBuffer()).toBe('')
    })

    it('should handle mixed complete and incomplete', () => {
      const lines: string[] = []
      const parser = createNdjsonParser((line) => lines.push(line))

      parser.feed('{"complete":true}\n{"partial":')
      expect(lines).toEqual(['{"complete":true}'])
      expect(parser.getBuffer()).toBe('{"partial":')
    })
  })

  describe('Event Parsing', () => {
    it('should parse assistant as normalized message event', () => {
      const json = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}'
      const event = parseClaudeEvent(json)

      expect(event).not.toBeNull()
      expect(event!.type).toBe('message')
    })

    it('should parse result as normalized complete event', () => {
      const json = '{"type":"result","session_id":"abc123"}'
      const event = parseClaudeEvent(json)

      expect(event).not.toBeNull()
      expect(event!.type).toBe('complete')
    })
  })

  describe('Full Flow Simulation', () => {
    it('should process realistic Claude output', () => {
      const events: AgentEvent[] = []
      const parser = createNdjsonParser((line) => {
        const event = parseClaudeEvent(line)
        if (event) events.push(event)
      })

      // Simulate realistic Claude output (as NDJSON)
      const claudeOutput = [
        '{"type":"init","session_id":"test-123"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"I understand you want me to "}]}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"help with something."}]}}',
        '{"type":"result","session_id":"test-123","cost":{"input":100,"output":50}}',
      ].join('\n') + '\n'

      parser.feed(claudeOutput)

      // Should have 2 message events and 1 complete event
      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('message')
      expect(events[1]!.type).toBe('message')
      expect(events[2]!.type).toBe('complete')
    })

    it('should handle chunked data arriving in pieces', () => {
      const events: AgentEvent[] = []
      const parser = createNdjsonParser((line) => {
        const event = parseClaudeEvent(line)
        if (event) events.push(event)
      })

      // Data arrives in chunks (simulating streaming)
      parser.feed('{"type":"assist')
      parser.feed('ant","message":{"content":[{"type":"text","text":"Hello"}]}}\n')
      parser.feed('{"type":"result"')
      parser.feed(',"session_id":"x"}\n')

      expect(events).toHaveLength(2)
      expect(events[0]!.type).toBe('message')
      expect(events[1]!.type).toBe('complete')
    })
  })
})
