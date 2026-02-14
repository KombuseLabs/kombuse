import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AgentHoverCard } from '../agent-hover-card'

const { mockPreviewRender } = vi.hoisted(() => ({
  mockPreviewRender: vi.fn(),
}))

vi.mock('../agent-preview-card', () => ({
  AgentPreviewCard: (props: { agentId: string; enabled?: boolean; onError?: () => void }) => {
    mockPreviewRender(props)
    return <div data-testid="agent-preview">{props.enabled ? 'enabled' : 'disabled'}</div>
  },
}))

vi.mock('../../../base/hover-card', () => ({
  HoverCard: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange?: (open: boolean) => void }) => (
    <div
      onMouseEnter={() => onOpenChange?.(true)}
      onMouseLeave={() => onOpenChange?.(false)}
    >
      {children}
    </div>
  ),
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('AgentHoverCard', () => {
  beforeEach(() => {
    mockPreviewRender.mockReset()
  })

  it('defers preview loading until hover intent', () => {
    const { getByText } = render(
      <AgentHoverCard agentId="agent-1">
        <span>Planning Agent</span>
      </AgentHoverCard>
    )

    expect(mockPreviewRender).toHaveBeenCalled()
    expect(mockPreviewRender.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent-1',
      enabled: false,
    })

    fireEvent.mouseEnter(getByText('Planning Agent'))

    const lastCall = mockPreviewRender.mock.calls.at(-1)?.[0]
    expect(lastCall).toMatchObject({
      agentId: 'agent-1',
      enabled: true,
    })
  })
})
