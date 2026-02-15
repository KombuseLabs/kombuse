import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { BACKEND_TYPES, type Agent, type Profile } from '@kombuse/types'
import { AgentDetail, type AgentDetailProps } from '../agent-detail'

if (!('ResizeObserver' in globalThis)) {
  const ResizeObserverStub = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  const base: Agent = {
    id: 'agent-1',
    system_prompt: 'System prompt',
    permissions: [],
    config: {
      enabled_for_chat: false,
      backend_type: BACKEND_TYPES.CODEX,
      model: 'gpt-4o-mini',
      temperature: 0.3,
    },
    is_enabled: true,
    created_at: '2026-02-13T00:00:00.000Z',
    updated_at: '2026-02-13T00:00:00.000Z',
  }

  return {
    ...base,
    ...overrides,
    config: {
      ...base.config,
      ...(overrides.config ?? {}),
    },
  }
}

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'agent-1',
    type: 'agent',
    name: 'Agent One',
    email: null,
    description: 'Agent description',
    avatar_url: 'bot',
    external_source: null,
    external_id: null,
    is_active: true,
    created_at: '2026-02-13T00:00:00.000Z',
    updated_at: '2026-02-13T00:00:00.000Z',
    ...overrides,
  }
}

function buildProps(overrides: Partial<AgentDetailProps> = {}): AgentDetailProps {
  return {
    agent: buildAgent(),
    profile: buildProfile(),
    ...overrides,
  }
}

function activateConfigurationTab(getByRole: (role: string, options: { name: string }) => HTMLElement) {
  const configurationTab = getByRole('tab', { name: 'Configuration' })
  fireEvent.mouseDown(configurationTab)
  return configurationTab
}

describe('AgentDetail', () => {
  it('renders Basic Info and Configuration tabs with Basic Info selected by default', () => {
    const { getAllByRole, getByRole, getByLabelText, queryByRole } = render(
      <AgentDetail {...buildProps()} />
    )

    expect(getAllByRole('tab')).toHaveLength(2)
    expect(getByRole('tab', { name: 'Basic Info' }).getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tab', { name: 'Configuration' }).getAttribute('aria-selected')).toBe('false')
    expect(getByLabelText('Name')).toBeDefined()
    expect(getByLabelText('Description')).toBeDefined()
    expect(queryByRole('switch')).toBeNull()
  })

  it('shows System Prompt in Basic Info and configuration fields (including triggers) only in the Configuration tab', () => {
    const onCreateTrigger = vi.fn().mockResolvedValue(undefined)
    const onUpdateTrigger = vi.fn().mockResolvedValue(undefined)
    const onDeleteTrigger = vi.fn().mockResolvedValue(undefined)
    const onToggleTrigger = vi.fn().mockResolvedValue(undefined)

    const { getByRole, getByLabelText, getByText } = render(
      <AgentDetail
        {...buildProps({
          onCreateTrigger,
          onUpdateTrigger,
          onDeleteTrigger,
          onToggleTrigger,
        })}
      />
    )

    expect(getByText('System Prompt')).toBeDefined()

    const configurationTab = activateConfigurationTab(getByRole)
    expect(configurationTab.getAttribute('aria-selected')).toBe('true')

    expect(getByText('Available in chat')).toBeDefined()
    expect(getByLabelText('Backend Override')).toBeDefined()
    expect(getByLabelText('Model Override')).toBeDefined()
    expect(getByText('Permissions')).toBeDefined()
    expect(getByText('Triggers')).toBeDefined()
  })

  it('keeps Basic Info scrollable while System Prompt remains the growable region', () => {
    const { getByRole, getByTestId, getByText, getByPlaceholderText } = render(
      <div style={{ height: '320px' }}>
        <AgentDetail {...buildProps()} />
      </div>
    )

    const basicInfoScroll = getByTestId('agent-basic-info-scroll')
    const systemPromptLabel = getByText('System Prompt')
    const systemPromptSection = systemPromptLabel.closest('div') as HTMLElement
    const promptTextarea = getByPlaceholderText(
      "Enter the agent's system prompt..."
    ) as HTMLTextAreaElement

    expect(basicInfoScroll.className).toContain('overflow-y-auto')
    expect(systemPromptSection.className).toContain('flex-1')
    expect(systemPromptSection.className).toContain('min-h-0')
    expect(promptTextarea.className).toContain('flex-1')
    expect(promptTextarea.className).toContain('min-h-0')

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))

    expect(getByText('Templating engine: Nunjucks')).toBeDefined()
    expect(basicInfoScroll.className).toContain('overflow-y-auto')
  })

  it('shows Save Changes when only the system prompt is edited in Basic Info', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { getByRole, getByPlaceholderText, queryByRole } = render(
      <AgentDetail {...buildProps({ onSave })} />
    )

    expect(queryByRole('button', { name: 'Save Changes' })).toBeNull()

    fireEvent.change(getByPlaceholderText("Enter the agent's system prompt..."), {
      target: { value: 'Updated system prompt' },
    })

    expect(getByRole('button', { name: 'Save Changes' })).toBeDefined()
  })

  it('keeps cross-tab unsaved edits and save action visible across tab switches', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { getByRole, getByLabelText, queryByRole } = render(
      <AgentDetail {...buildProps({ onSave })} />
    )

    expect(queryByRole('button', { name: 'Save Changes' })).toBeNull()

    fireEvent.change(getByLabelText('Name'), { target: { value: 'Updated Agent' } })
    expect(getByRole('button', { name: 'Save Changes' })).toBeDefined()

    activateConfigurationTab(getByRole)
    expect(getByRole('button', { name: 'Save Changes' })).toBeDefined()

    fireEvent.mouseDown(getByRole('tab', { name: 'Basic Info' }))
    expect((getByLabelText('Name') as HTMLInputElement).value).toBe('Updated Agent')
  })

  it('preserves in-progress permission drafts across tab switches', () => {
    const { getByRole, getByPlaceholderText } = render(<AgentDetail {...buildProps()} />)

    activateConfigurationTab(getByRole)
    fireEvent.click(getByRole('button', { name: 'Add Permission' }))

    fireEvent.change(getByPlaceholderText('e.g., project:proj-*, status:open'), {
      target: { value: 'project:alpha-*' },
    })

    fireEvent.mouseDown(getByRole('tab', { name: 'Basic Info' }))
    activateConfigurationTab(getByRole)

    expect((getByPlaceholderText('e.g., project:proj-*, status:open') as HTMLInputElement).value).toBe(
      'project:alpha-*'
    )
  })

  it('resets the active tab to Basic Info when switching to another agent', () => {
    const { getByRole, rerender } = render(<AgentDetail {...buildProps()} />)

    const configurationTab = activateConfigurationTab(getByRole)
    expect(configurationTab.getAttribute('aria-selected')).toBe('true')

    rerender(
      <AgentDetail
        {...buildProps({
          agent: buildAgent({ id: 'agent-2' }),
          profile: buildProfile({
            id: 'agent-2',
            name: 'Agent Two',
          }),
        })}
      />
    )

    expect(getByRole('tab', { name: 'Basic Info' }).getAttribute('aria-selected')).toBe('true')
  })

  it('preserves onSave payload shape and normalization for config updates', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { getByRole, getByLabelText } = render(
      <AgentDetail
        {...buildProps({
          agent: buildAgent({
            config: {
              enabled_for_chat: true,
              backend_type: BACKEND_TYPES.CODEX,
              model: 'gpt-4o-mini',
              temperature: 0.7,
            },
          }),
          onSave,
        })}
      />
    )

    const configurationTab = activateConfigurationTab(getByRole)
    expect(configurationTab.getAttribute('aria-selected')).toBe('true')
    fireEvent.change(getByLabelText('Backend Override'), { target: { value: 'global' } })
    fireEvent.change(getByLabelText('Model Override'), { target: { value: '   ' } })
    fireEvent.click(getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    const updates = onSave.mock.calls[0]?.[0] as Parameters<
      NonNullable<AgentDetailProps['onSave']>
    >[0]

    expect(updates.profile).toEqual({
      name: 'Agent One',
      description: 'Agent description',
      avatar_url: 'bot',
    })
    expect(updates.agent.system_prompt).toBe('System prompt')
    expect(updates.agent.permissions).toEqual([])
    expect(updates.agent.config).toEqual(
      expect.objectContaining({
        enabled_for_chat: true,
        temperature: 0.7,
      })
    )
    expect(updates.agent.config).not.toHaveProperty('backend_type')
    expect(updates.agent.config).not.toHaveProperty('model')
  })
})
