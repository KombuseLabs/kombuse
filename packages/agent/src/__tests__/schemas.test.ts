import { describe, it, expect } from 'vitest'
import {
  claudeSystemMessageSchema,
  claudeAssistantMessageSchema,
  claudeUserMessageSchema,
  claudeResultSuccessSchema,
  claudeResultErrorSchema,
  claudeResultSchema,
  claudeProgressMessageSchema,
  claudeQueueOperationSchema,
  claudeFileHistorySnapshotSchema,
  claudeControlRequestSchema,
  claudeJsonlItemSchema,
  claudeContentBlockSchema,
  validateJsonlItem,
} from '../backends/claude-code/schemas'

// =============================================================================
// Fixtures
// =============================================================================

const baseMeta = {
  parentUuid: null,
  sessionId: 'session-1',
  uuid: 'uuid-1',
  timestamp: '2025-01-15T12:00:00.000Z',
}

// =============================================================================
// Content Block Schemas
// =============================================================================

describe('claudeContentBlockSchema', () => {
  it('validates text blocks', () => {
    const result = claudeContentBlockSchema.safeParse({ type: 'text', text: 'hello' })
    expect(result.success, 'text block should be valid').toBe(true)
  })

  it('validates thinking blocks', () => {
    const result = claudeContentBlockSchema.safeParse({ type: 'thinking', thinking: 'hmm...' })
    expect(result.success, 'thinking block should be valid').toBe(true)
  })

  it('validates tool_use blocks', () => {
    const result = claudeContentBlockSchema.safeParse({
      type: 'tool_use',
      id: 'tu-1',
      name: 'Read',
      input: { file_path: '/tmp/test.ts' },
    })
    expect(result.success, 'tool_use block should be valid').toBe(true)
  })

  it('validates tool_result blocks with string content', () => {
    const result = claudeContentBlockSchema.safeParse({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: 'file contents here',
    })
    expect(result.success, 'tool_result with string content should be valid').toBe(true)
  })

  it('validates tool_result blocks with array content', () => {
    const result = claudeContentBlockSchema.safeParse({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: [{ type: 'text', text: 'output' }],
    })
    expect(result.success, 'tool_result with array content should be valid').toBe(true)
  })

  it('allows extra properties via passthrough', () => {
    const result = claudeContentBlockSchema.safeParse({
      type: 'text',
      text: 'hello',
      citations: [{ source: 'doc.md' }],
    })
    expect(result.success, 'extra properties should be allowed').toBe(true)
  })

  it('rejects unknown block types', () => {
    const result = claudeContentBlockSchema.safeParse({ type: 'image', url: 'https://example.com' })
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// System Message
// =============================================================================

describe('claudeSystemMessageSchema', () => {
  it('validates a system init message', () => {
    const item = {
      ...baseMeta,
      type: 'system',
      subtype: 'init',
      session_id: 'session-1',
      tools: ['Read', 'Write', 'Bash'],
      model: 'claude-sonnet-4-5-20250929',
      permissionMode: 'default',
    }
    const result = claudeSystemMessageSchema.safeParse(item)
    expect(result.success, 'system message should be valid').toBe(true)
  })

  it('validates system message with mcp_servers', () => {
    const item = {
      ...baseMeta,
      type: 'system',
      subtype: 'init',
      mcp_servers: [{ name: 'kombuse', status: 'connected' }],
    }
    const result = claudeSystemMessageSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects system message missing required fields', () => {
    const item = { type: 'system' } // missing uuid, sessionId, timestamp
    const result = claudeSystemMessageSchema.safeParse(item)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// Assistant Message
// =============================================================================

describe('claudeAssistantMessageSchema', () => {
  it('validates an assistant message with text content', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
      },
    }
    const result = claudeAssistantMessageSchema.safeParse(item)
    expect(result.success, 'assistant message should be valid').toBe(true)
  })

  it('validates an assistant message with tool_use content', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/tmp/x' } },
        ],
      },
      requestId: 'req-1',
    }
    const result = claudeAssistantMessageSchema.safeParse(item)
    expect(result.success, 'assistant message with tool_use should be valid').toBe(true)
  })

  it('validates an assistant message with multiple content blocks', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me think...' },
          { type: 'text', text: 'Here is the answer' },
          { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    }
    const result = claudeAssistantMessageSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects assistant message with wrong role', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: { role: 'user', content: [] },
    }
    const result = claudeAssistantMessageSchema.safeParse(item)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// User Message
// =============================================================================

describe('claudeUserMessageSchema', () => {
  it('validates a user message with array content', () => {
    const item = {
      ...baseMeta,
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }],
      },
    }
    const result = claudeUserMessageSchema.safeParse(item)
    expect(result.success, 'user message should be valid').toBe(true)
  })

  it('validates a user message with non-array content', () => {
    const item = {
      ...baseMeta,
      type: 'user',
      message: { role: 'user', content: 'Hello Claude' },
    }
    const result = claudeUserMessageSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('validates a user message with optional fields', () => {
    const item = {
      ...baseMeta,
      type: 'user',
      message: { role: 'user', content: [] },
      isMeta: true,
      toolUseResult: { some: 'data' },
      sourceToolAssistantUUID: 'uuid-2',
    }
    const result = claudeUserMessageSchema.safeParse(item)
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// Result Messages
// =============================================================================

describe('claudeResultSuccessSchema', () => {
  const successResult = {
    ...baseMeta,
    type: 'result',
    subtype: 'success',
    session_id: 'session-1',
    duration_ms: 5000,
    duration_api_ms: 4500,
    is_error: false,
    num_turns: 3,
    result: 'Task completed successfully',
    total_cost_usd: 0.05,
    usage: { input_tokens: 1000, output_tokens: 500 },
  }

  it('validates a success result', () => {
    const result = claudeResultSuccessSchema.safeParse(successResult)
    expect(result.success, 'success result should be valid').toBe(true)
  })

  it('rejects when result string is missing', () => {
    const { result: _result, ...noResult } = successResult
    const parsed = claudeResultSuccessSchema.safeParse(noResult)
    expect(parsed.success).toBe(false)
  })
})

describe('claudeResultErrorSchema', () => {
  const errorResult = {
    ...baseMeta,
    type: 'result',
    subtype: 'error_during_execution',
    session_id: 'session-1',
    duration_ms: 2000,
    duration_api_ms: 1800,
    is_error: true,
    num_turns: 1,
    total_cost_usd: 0.01,
    errors: ['Something went wrong'],
  }

  it('validates an error result', () => {
    const result = claudeResultErrorSchema.safeParse(errorResult)
    expect(result.success, 'error result should be valid').toBe(true)
  })

  it('validates all error subtypes', () => {
    const subtypes = [
      'error_max_turns',
      'error_during_execution',
      'error_max_budget_usd',
      'error_max_structured_output_retries',
    ] as const

    for (const subtype of subtypes) {
      const result = claudeResultErrorSchema.safeParse({ ...errorResult, subtype })
      expect(result.success, `subtype "${subtype}" should be valid`).toBe(true)
    }
  })

  it('rejects invalid error subtype', () => {
    const result = claudeResultErrorSchema.safeParse({ ...errorResult, subtype: 'error_unknown' })
    expect(result.success).toBe(false)
  })
})

describe('claudeResultSchema', () => {
  it('validates success results', () => {
    const result = claudeResultSchema.safeParse({
      ...baseMeta,
      type: 'result',
      subtype: 'success',
      session_id: 's-1',
      duration_ms: 100,
      duration_api_ms: 90,
      is_error: false,
      num_turns: 1,
      result: 'done',
      total_cost_usd: 0.01,
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    expect(result.success).toBe(true)
  })

  it('validates error results', () => {
    const result = claudeResultSchema.safeParse({
      ...baseMeta,
      type: 'result',
      subtype: 'error_max_turns',
      session_id: 's-1',
      duration_ms: 100,
      duration_api_ms: 90,
      is_error: true,
      num_turns: 10,
      total_cost_usd: 0.50,
      errors: ['Max turns reached'],
    })
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// Control Request
// =============================================================================

describe('claudeControlRequestSchema', () => {
  it('validates a control request', () => {
    const item = {
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'tu-1',
        input: { command: 'rm -rf /tmp/test' },
      },
    }
    const result = claudeControlRequestSchema.safeParse(item)
    expect(result.success, 'control request should be valid').toBe(true)
  })

  it('rejects control request with missing request_id', () => {
    const item = {
      type: 'control_request',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'tu-1',
        input: {},
      },
    }
    const result = claudeControlRequestSchema.safeParse(item)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// JSONL-only Types
// =============================================================================

describe('claudeProgressMessageSchema', () => {
  it('validates a progress message', () => {
    const item = {
      ...baseMeta,
      type: 'progress',
      data: { some: 'partial data' },
      toolUseID: 'tu-1',
    }
    const result = claudeProgressMessageSchema.safeParse(item)
    expect(result.success).toBe(true)
  })
})

describe('claudeQueueOperationSchema', () => {
  it('validates a queue operation', () => {
    const item = {
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: '2025-01-15T12:00:00.000Z',
      sessionId: 'session-1',
    }
    const result = claudeQueueOperationSchema.safeParse(item)
    expect(result.success).toBe(true)
  })
})

describe('claudeFileHistorySnapshotSchema', () => {
  it('validates a file history snapshot', () => {
    const item = {
      type: 'file-history-snapshot',
      messageId: 'msg-1',
      snapshot: { files: [] },
    }
    const result = claudeFileHistorySnapshotSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('validates snapshot with isSnapshotUpdate', () => {
    const item = {
      type: 'file-history-snapshot',
      messageId: 'msg-1',
      snapshot: {},
      isSnapshotUpdate: true,
    }
    const result = claudeFileHistorySnapshotSchema.safeParse(item)
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// Discriminated Union (claudeJsonlItemSchema)
// =============================================================================

describe('claudeJsonlItemSchema', () => {
  it('dispatches to system schema', () => {
    const item = { ...baseMeta, type: 'system', subtype: 'init' }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to assistant schema', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to user schema', () => {
    const item = {
      ...baseMeta,
      type: 'user',
      message: { role: 'user', content: [] },
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to progress schema', () => {
    const item = { ...baseMeta, type: 'progress' }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to queue-operation schema', () => {
    const item = {
      type: 'queue-operation',
      operation: 'dequeue',
      timestamp: '2025-01-15T12:00:00.000Z',
      sessionId: 'session-1',
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to file-history-snapshot schema', () => {
    const item = {
      type: 'file-history-snapshot',
      messageId: 'msg-1',
      snapshot: null,
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('dispatches to control_request schema', () => {
    const item = {
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        tool_use_id: 'tu-2',
        input: { file_path: '/tmp/x', content: 'y' },
      },
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects result type (must use claudeResultSchema separately)', () => {
    const item = {
      ...baseMeta,
      type: 'result',
      subtype: 'success',
      session_id: 's',
      duration_ms: 1,
      duration_api_ms: 1,
      is_error: false,
      num_turns: 1,
      result: 'ok',
      total_cost_usd: 0.01,
      usage: { input_tokens: 1, output_tokens: 1 },
    }
    const result = claudeJsonlItemSchema.safeParse(item)
    expect(result.success).toBe(false)
  })

  it('rejects completely unknown types', () => {
    const result = claudeJsonlItemSchema.safeParse({ type: 'banana', data: 123 })
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// validateJsonlItem (unified validator)
// =============================================================================

describe('validateJsonlItem', () => {
  it('validates system messages via discriminated union', () => {
    const item = { ...baseMeta, type: 'system', subtype: 'init' }
    const result = validateJsonlItem(item)
    expect(result.success).toBe(true)
  })

  it('validates assistant messages', () => {
    const item = {
      ...baseMeta,
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hey' }] },
    }
    const result = validateJsonlItem(item)
    expect(result.success).toBe(true)
  })

  it('routes result type to claudeResultSchema', () => {
    const item = {
      ...baseMeta,
      type: 'result',
      subtype: 'success',
      session_id: 's',
      duration_ms: 1,
      duration_api_ms: 1,
      is_error: false,
      num_turns: 1,
      result: 'done',
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 },
    }
    const result = validateJsonlItem(item)
    expect(result.success, 'result type should be validated via claudeResultSchema').toBe(true)
  })

  it('routes error result type to claudeResultSchema', () => {
    const item = {
      ...baseMeta,
      type: 'result',
      subtype: 'error_max_turns',
      session_id: 's',
      duration_ms: 1,
      duration_api_ms: 1,
      is_error: true,
      num_turns: 10,
      total_cost_usd: 0.5,
      errors: ['Too many turns'],
    }
    const result = validateJsonlItem(item)
    expect(result.success).toBe(true)
  })

  it('returns failure for null input', () => {
    const result = validateJsonlItem(null)
    expect(result.success).toBe(false)
  })

  it('returns failure for non-object input', () => {
    const result = validateJsonlItem('not an object')
    expect(result.success).toBe(false)
  })

  it('returns failure for object without type', () => {
    const result = validateJsonlItem({ foo: 'bar' })
    expect(result.success).toBe(false)
  })

  it('returns failure for invalid result structure', () => {
    const result = validateJsonlItem({ type: 'result', subtype: 'success' })
    expect(result.success).toBe(false)
  })
})
