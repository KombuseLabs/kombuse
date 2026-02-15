import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { PublicSession } from '@kombuse/types'
import { SessionList } from '../session-list'

vi.mock('date-fns', () => ({
  formatDistanceToNowStrict: () => '1 hour',
}))

function buildSession(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    kombuse_session_id: 'trigger-11111111-1111-1111-1111-111111111111' as PublicSession['kombuse_session_id'],
    backend_type: 'claude-code',
    backend_session_id: null,
    ticket_id: 382,
    project_id: '1',
    agent_id: null,
    status: 'completed',
    metadata: {},
    started_at: '2026-02-15T00:00:00.000Z',
    completed_at: null,
    failed_at: null,
    aborted_at: null,
    last_event_seq: 0,
    created_at: '2026-02-15T00:00:00.000Z',
    updated_at: '2026-02-15T00:00:00.000Z',
    agent_name: 'Coding Agent',
    prompt_preview: null,
    effective_backend: 'claude-code',
    model_preference: null,
    applied_model: null,
    ...overrides,
  }
}

describe('SessionList card variant', () => {
  it('applies selected card styles without left-border classes in card mode', () => {
    const session = buildSession()
    const view = render(
      <SessionList
        sessions={[session]}
        variant="card"
        selectedSessionId={session.kombuse_session_id}
      />,
    )

    const item = view.getByTestId(`session-item-${session.kombuse_session_id}`)
    expect(item.className.includes('ring-1')).toBe(true)
    expect(item.className.includes('border-l-')).toBe(false)
  })

  it('renders a clipped shell with internal scrolling in card mode', () => {
    const session = buildSession()
    const view = render(
      <SessionList
        sessions={[session]}
        variant="card"
      />,
    )

    const shell = view.getByTestId('session-list-shell')
    const viewport = view.getByTestId('session-list-viewport')
    expect(shell.className.includes('overflow-hidden')).toBe(true)
    expect(viewport.className.includes('overflow-y-auto')).toBe(true)
  })

  it('renders a list-owned header section in card mode when provided', () => {
    const session = buildSession()
    const view = render(
      <SessionList
        sessions={[session]}
        variant="card"
        header={<div data-testid="session-header-slot">Sessions</div>}
      />,
    )

    expect(view.getByTestId('session-list-header')).toBeDefined()
    expect(view.getByTestId('session-header-slot')).toBeDefined()
  })
})
