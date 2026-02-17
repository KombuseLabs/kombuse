import { describe, it, expect } from 'vitest'
import type { SessionEvent } from '@kombuse/types'
import { buildConversationSummary } from '../session-persistence-service'

function makeMessageEvent(seq: number, role: string, content: string): SessionEvent {
  return {
    id: seq,
    session_id: 'session-1',
    kombuse_session_id: null,
    seq,
    event_type: 'message',
    payload: { type: 'message', role, content },
    created_at: new Date().toISOString(),
  }
}

function makeToolEvent(seq: number): SessionEvent {
  return {
    id: seq,
    session_id: 'session-1',
    kombuse_session_id: null,
    seq,
    event_type: 'tool_use',
    payload: { type: 'tool_use', name: 'Read', input: {} },
    created_at: new Date().toISOString(),
  }
}

describe('buildConversationSummary', () => {
  it('returns empty string for empty events array', () => {
    expect(buildConversationSummary([])).toBe('')
  })

  it('returns empty string when no message events exist', () => {
    expect(buildConversationSummary([makeToolEvent(1), makeToolEvent(2)])).toBe('')
  })

  it('formats user and assistant messages correctly', () => {
    const events = [
      makeMessageEvent(1, 'user', 'Hello'),
      makeMessageEvent(2, 'assistant', 'Hi there'),
    ]
    const result = buildConversationSummary(events)
    expect(result).toContain('**User**: Hello')
    expect(result).toContain('**Assistant**: Hi there')
  })

  it('filters out non-message events', () => {
    const events = [
      makeMessageEvent(1, 'user', 'Hello'),
      makeToolEvent(2),
      makeMessageEvent(3, 'assistant', 'Hi'),
    ]
    const result = buildConversationSummary(events)
    expect(result).not.toContain('tool_use')
    expect(result).toContain('**User**: Hello')
    expect(result).toContain('**Assistant**: Hi')
  })

  it('preserves chronological order', () => {
    const events = [
      makeMessageEvent(1, 'user', 'First'),
      makeMessageEvent(2, 'assistant', 'Second'),
      makeMessageEvent(3, 'user', 'Third'),
    ]
    const result = buildConversationSummary(events)
    const firstIdx = result.indexOf('First')
    const secondIdx = result.indexOf('Second')
    const thirdIdx = result.indexOf('Third')
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(secondIdx).toBeLessThan(thirdIdx)
  })

  it('truncates to most recent turns within character budget', () => {
    const events: SessionEvent[] = []
    for (let i = 0; i < 100; i++) {
      events.push(makeMessageEvent(i + 1, i % 2 === 0 ? 'user' : 'assistant', 'A'.repeat(200)))
    }
    const result = buildConversationSummary(events)
    // Should be within budget (8000 chars + label overhead)
    expect(result.length).toBeLessThanOrEqual(8500)
    // Should contain the last event's content (most recent is always kept)
    expect(result).toContain('A'.repeat(200))
  })

  it('skips events with missing role or content', () => {
    const events: SessionEvent[] = [
      {
        id: 1,
        session_id: 'session-1',
        kombuse_session_id: null,
        seq: 1,
        event_type: 'message',
        payload: { type: 'message' },
        created_at: new Date().toISOString(),
      },
      makeMessageEvent(2, 'user', 'Valid'),
    ]
    const result = buildConversationSummary(events)
    expect(result).toBe('**User**: Valid')
  })

  it('handles single message event', () => {
    const events = [makeMessageEvent(1, 'user', 'Just one')]
    const result = buildConversationSummary(events)
    expect(result).toBe('**User**: Just one')
  })

  it('uses generic label for unknown roles', () => {
    const events = [makeMessageEvent(1, 'system', 'System message')]
    const result = buildConversationSummary(events)
    expect(result).toBe('**system**: System message')
  })
})
