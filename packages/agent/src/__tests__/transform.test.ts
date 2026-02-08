import { describe, it, expect } from 'vitest'
import { transformJsonlToAgentEvents } from '../backends/claude-code/transform'
import type { SerializedAgentEvent } from '@kombuse/types'

// =============================================================================
// Helpers
// =============================================================================

const baseItem = (overrides: Record<string, unknown>) => ({
  uuid: 'uuid-1',
  timestamp: '2025-01-15T12:00:00.000Z',
  sessionId: 'session-1',
  parentUuid: null,
  ...overrides,
})

function findByType<T extends SerializedAgentEvent['type']>(
  events: SerializedAgentEvent[],
  type: T,
): Extract<SerializedAgentEvent, { type: T }>[] {
  return events.filter((e) => e.type === type) as Extract<SerializedAgentEvent, { type: T }>[]
}

// =============================================================================
// Assistant Messages
// =============================================================================

describe('transformJsonlToAgentEvents – assistant', () => {
  it('transforms a text block into a message event', () => {
    const items = [baseItem({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('message')
    if (events[0]!.type === 'message') {
      expect(events[0]!.role).toBe('assistant')
      expect(events[0]!.content).toBe('Hello world')
    }
  })

  it('transforms a tool_use block into a tool_use event', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'tu-1',
          name: 'Read',
          input: { file_path: '/tmp/test.ts' },
        }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('tool_use')
    if (events[0]!.type === 'tool_use') {
      expect(events[0]!.name).toBe('Read')
      expect(events[0]!.input).toEqual({ file_path: '/tmp/test.ts' })
    }
  })

  it('transforms a thinking block into a raw event', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me consider...' }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('raw')
    if (events[0]!.type === 'raw') {
      expect(events[0]!.sourceType).toBe('thinking')
    }
  })

  it('transforms multiple content blocks into multiple events', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will read the file.' },
          { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/x' } },
        ],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(2)
    expect(events[0]!.type).toBe('message')
    expect(events[1]!.type).toBe('tool_use')
  })

  it('assigns unique eventIds for multiple content blocks', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(2)
    expect(events[0]!.eventId).toBe('uuid-1-0')
    expect(events[1]!.eventId).toBe('uuid-1-1')
  })

  it('uses uuid directly for single content block', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'only one' }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.eventId).toBe('uuid-1')
  })

  it('skips empty text blocks', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: '   ' },
          { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('tool_use')
  })

  it('falls back to raw event when content is not an array', () => {
    const items = [baseItem({
      type: 'assistant',
      message: { role: 'assistant', content: 'just a string' },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('raw')
    if (events[0]!.type === 'raw') {
      expect(events[0]!.sourceType).toBe('assistant')
    }
  })

  it('falls back to raw event when all content blocks are empty', () => {
    const items = [baseItem({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('raw')
  })

  it('parses timestamp correctly', () => {
    const items = [baseItem({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      timestamp: '2025-06-15T10:30:00.000Z',
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.timestamp).toBe(new Date('2025-06-15T10:30:00.000Z').getTime())
  })

  it('uses 0 for missing timestamp', () => {
    const items = [{
      type: 'assistant',
      uuid: 'uuid-no-ts',
      message: { role: 'assistant', content: [{ type: 'text', text: 'no ts' }] },
    }]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.timestamp).toBe(0)
  })

  it('uses 0 for invalid timestamp', () => {
    const items = [baseItem({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'bad ts' }] },
      timestamp: 'not-a-date',
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.timestamp).toBe(0)
  })
})

// =============================================================================
// User Messages
// =============================================================================

describe('transformJsonlToAgentEvents – user', () => {
  it('transforms tool_result blocks into tool_result events', () => {
    const items = [baseItem({
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-1',
          content: 'file contents here',
        }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('tool_result')
    if (events[0]!.type === 'tool_result') {
      expect(events[0]!.toolUseId).toBe('tu-1')
      expect(events[0]!.content).toBe('file contents here')
    }
  })

  it('handles is_error on tool_result', () => {
    const items = [baseItem({
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-1',
          content: 'Error: file not found',
          is_error: true,
        }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.type).toBe('tool_result')
    if (events[0]!.type === 'tool_result') {
      expect(events[0]!.isError).toBe(true)
    }
  })

  it('returns raw event when user content is not array', () => {
    const items = [baseItem({
      type: 'user',
      message: { role: 'user', content: 'Hello Claude' },
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('raw')
    if (events[0]!.type === 'raw') {
      expect(events[0]!.sourceType).toBe('user')
    }
  })

  it('returns empty array for user message with no mappable content', () => {
    const items = [baseItem({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'unknown_block', data: 'something' }],
      },
    })]

    const events = transformJsonlToAgentEvents(items)
    // Unknown block types are skipped, so no events
    expect(events).toHaveLength(0)
  })
})

// =============================================================================
// Result Messages
// =============================================================================

describe('transformJsonlToAgentEvents – result', () => {
  it('transforms a success result into a complete event', () => {
    const items = [baseItem({
      type: 'result',
      subtype: 'success',
      session_id: 'session-abc',
      is_error: false,
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('complete')
    if (events[0]!.type === 'complete') {
      expect(events[0]!.success).toBe(true)
      expect(events[0]!.sessionId).toBe('session-abc')
      expect(events[0]!.reason).toBe('result')
    }
  })

  it('transforms an error result into complete + error events', () => {
    const items = [baseItem({
      type: 'result',
      subtype: 'error_during_execution',
      session_id: 'session-err',
      is_error: true,
      errors: ['Something broke', 'Another issue'],
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(2)

    const complete = findByType(events, 'complete')
    expect(complete).toHaveLength(1)
    expect(complete[0]!.success).toBe(false)

    const errors = findByType(events, 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toBe('Something broke; Another issue')
  })

  it('does not emit error event for error result with no errors array', () => {
    const items = [baseItem({
      type: 'result',
      subtype: 'error_max_turns',
      session_id: 's-1',
      is_error: true,
      errors: [],
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('complete')
  })

  it('treats subtype=success with is_error=true as failure', () => {
    const items = [baseItem({
      type: 'result',
      subtype: 'success',
      session_id: 's-1',
      is_error: true,
    })]

    const events = transformJsonlToAgentEvents(items)
    if (events[0]!.type === 'complete') {
      expect(events[0]!.success).toBe(false)
    }
  })
})

// =============================================================================
// Control Request
// =============================================================================

describe('transformJsonlToAgentEvents – control_request', () => {
  it('transforms a control request into a permission_request event', () => {
    const items = [{
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'tu-1',
        input: { command: 'ls -la' },
      },
    }]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('permission_request')
    if (events[0]!.type === 'permission_request') {
      expect(events[0]!.toolName).toBe('Bash')
      expect(events[0]!.toolUseId).toBe('tu-1')
      expect(events[0]!.requestId).toBe('req-1')
      expect(events[0]!.input).toEqual({ command: 'ls -la' })
    }
  })

  it('uses request_id as eventId', () => {
    const items = [{
      type: 'control_request',
      request_id: 'req-42',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        tool_use_id: 'tu-2',
        input: {},
      },
    }]

    const events = transformJsonlToAgentEvents(items)
    expect(events[0]!.eventId).toBe('req-42')
  })

  it('returns empty array when request is missing', () => {
    const items = [{
      type: 'control_request',
      request_id: 'req-1',
    }]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(0)
  })
})

// =============================================================================
// System Messages
// =============================================================================

describe('transformJsonlToAgentEvents – system', () => {
  it('transforms a system message into a raw event', () => {
    const items = [baseItem({
      type: 'system',
      subtype: 'init',
      session_id: 'session-1',
      tools: ['Read', 'Write'],
      model: 'claude-sonnet-4-5-20250929',
    })]

    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('raw')
    if (events[0]!.type === 'raw') {
      expect(events[0]!.sourceType).toBe('init')
    }
  })

  it('uses "system" as sourceType when subtype is absent', () => {
    const items = [baseItem({ type: 'system' })]

    const events = transformJsonlToAgentEvents(items)
    if (events[0]!.type === 'raw') {
      expect(events[0]!.sourceType).toBe('system')
    }
  })
})

// =============================================================================
// Skipped Types
// =============================================================================

describe('transformJsonlToAgentEvents – skipped types', () => {
  it('skips progress messages', () => {
    const items = [baseItem({ type: 'progress', data: { partial: true } })]
    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(0)
  })

  it('skips queue-operation messages', () => {
    const items = [{
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: '2025-01-15T12:00:00.000Z',
      sessionId: 'session-1',
    }]
    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(0)
  })

  it('skips file-history-snapshot messages', () => {
    const items = [{
      type: 'file-history-snapshot',
      messageId: 'msg-1',
      snapshot: {},
    }]
    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(0)
  })

  it('skips unknown types', () => {
    const items = [{ type: 'some_future_type', data: 'whatever' }]
    const events = transformJsonlToAgentEvents(items)
    expect(events).toHaveLength(0)
  })
})

// =============================================================================
// Mixed Items (Integration)
// =============================================================================

describe('transformJsonlToAgentEvents – mixed items', () => {
  it('processes a realistic sequence of JSONL items', () => {
    const items = [
      baseItem({
        type: 'system',
        subtype: 'init',
        uuid: 'sys-1',
        session_id: 'session-1',
        tools: ['Read', 'Write'],
        model: 'claude-sonnet-4-5-20250929',
      }),
      baseItem({
        type: 'assistant',
        uuid: 'asst-1',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read the file.' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/test.ts' } },
          ],
        },
      }),
      baseItem({
        type: 'user',
        uuid: 'user-1',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'tu-1',
            content: 'const x = 1',
          }],
        },
      }),
      baseItem({ type: 'progress', uuid: 'prog-1', data: { tokens: 100 } }),
      baseItem({
        type: 'assistant',
        uuid: 'asst-2',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done!' }],
        },
      }),
      baseItem({
        type: 'result',
        uuid: 'result-1',
        subtype: 'success',
        session_id: 'session-1',
        is_error: false,
      }),
    ]

    const events = transformJsonlToAgentEvents(items)

    // system -> raw (1), assistant -> message + tool_use (2), user -> tool_result (1),
    // progress -> skipped (0), assistant -> message (1), result -> complete (1)
    expect(events).toHaveLength(6)

    expect(events[0]!.type).toBe('raw')     // system
    expect(events[1]!.type).toBe('message')  // "Let me read the file."
    expect(events[2]!.type).toBe('tool_use') // Read
    expect(events[3]!.type).toBe('tool_result') // tool_result from user
    expect(events[4]!.type).toBe('message')  // "Done!"
    expect(events[5]!.type).toBe('complete') // result
  })

  it('handles empty items array', () => {
    const events = transformJsonlToAgentEvents([])
    expect(events).toHaveLength(0)
  })

  it('sets backend to claude-code for all events', () => {
    const items = [
      baseItem({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      }),
      baseItem({ type: 'system', subtype: 'init' }),
    ]

    const events = transformJsonlToAgentEvents(items)
    for (const event of events) {
      expect(event.backend).toBe('claude-code')
    }
  })
})
