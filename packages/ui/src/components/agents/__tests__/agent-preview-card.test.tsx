import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Agent, AgentTrigger, Permission, Profile } from '@kombuse/types'
import { AgentPreviewCard } from '../agent-preview-card'
import { useAgentWithProfile } from '../../../hooks/use-agents'
import { useTriggers } from '../../../hooks/use-triggers'

vi.mock('../../../hooks/use-agents', () => ({
  useAgentWithProfile: vi.fn(),
}))

vi.mock('../../../hooks/use-triggers', () => ({
  useTriggers: vi.fn(),
}))

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    slug: null,
    system_prompt: 'System prompt',
    permissions: [],
    config: {},
    is_enabled: true,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    ...overrides,
  }
}

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'agent-1',
    type: 'agent',
    name: 'Coding Agent',
    email: null,
    description: null,
    avatar_url: 'code',
    external_source: null,
    external_id: null,
    is_active: true,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    ...overrides,
  }
}

function buildTrigger(overrides: Partial<AgentTrigger> = {}): AgentTrigger {
  return {
    id: 1,
    agent_id: 'agent-1',
    event_type: 'comment.added',
    project_id: null,
    conditions: null,
    is_enabled: true,
    priority: 0,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    ...overrides,
  }
}

describe('AgentPreviewCard', () => {
  const mockUseAgentWithProfile = vi.mocked(useAgentWithProfile)
  const mockUseTriggers = vi.mocked(useTriggers)

  beforeEach(() => {
    mockUseAgentWithProfile.mockReset()
    mockUseTriggers.mockReset()
  })

  it('renders a loading skeleton while fetching', () => {
    mockUseAgentWithProfile.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useAgentWithProfile>)
    mockUseTriggers.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useTriggers>)

    const { getByLabelText } = render(
      <MemoryRouter>
        <AgentPreviewCard agentId="agent-1" />
      </MemoryRouter>
    )

    expect(getByLabelText('Loading agent preview')).toBeDefined()
  })

  it('renders critical agent info and detail link', () => {
    const permissions: Permission[] = [
      {
        type: 'resource',
        resource: 'ticket',
        actions: ['read', 'update'],
        scope: 'project',
      },
      {
        type: 'resource',
        resource: 'ticket',
        actions: ['create'],
        scope: 'project',
      },
      {
        type: 'tool',
        tool: 'mcp__kombuse__query_db',
        scope: 'project',
      },
    ]

    mockUseAgentWithProfile.mockReturnValue({
      data: {
        agent: buildAgent({
          permissions,
          config: { model: 'gpt-5-mini' },
          is_enabled: true,
        }),
        profile: buildProfile({ name: 'Planning Agent' }),
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAgentWithProfile>)
    mockUseTriggers.mockReturnValue({
      data: [
        buildTrigger({ id: 1, event_type: 'ticket.created', is_enabled: true }),
        buildTrigger({ id: 2, event_type: 'agent.failed', is_enabled: false }),
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useTriggers>)

    const { getByText, getByRole } = render(
      <MemoryRouter>
        <AgentPreviewCard agentId="agent-1" />
      </MemoryRouter>
    )

    expect(getByText('Planning Agent')).toBeDefined()
    expect(getByText('Enabled')).toBeDefined()
    expect(getByText('gpt-5-mini')).toBeDefined()
    expect(getByText('ticket.created')).toBeDefined()
    expect(getByText('agent.failed')).toBeDefined()
    expect(getByText('ticket: read, update, create')).toBeDefined()
    expect(getByText('1 tool permission')).toBeDefined()

    const detailsLink = getByRole('link', { name: 'View full details' })
    expect(detailsLink.getAttribute('href')).toBe('/agents/agent-1')
  })

  it('renders nothing and notifies parent when loading fails', async () => {
    const onError = vi.fn()
    mockUseAgentWithProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useAgentWithProfile>)
    mockUseTriggers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useTriggers>)

    const { container } = render(
      <MemoryRouter>
        <AgentPreviewCard agentId="agent-1" onError={onError} />
      </MemoryRouter>
    )

    expect(container.firstChild).toBeNull()
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })
})
