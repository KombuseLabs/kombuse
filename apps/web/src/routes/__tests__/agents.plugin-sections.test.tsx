import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  mockUpdatePluginMutate,
  mockAgentsData,
  mockInstalledPluginsData,
  mockUpdatePluginState,
} = vi.hoisted(() => ({
  mockUpdatePluginMutate: vi.fn(),
  mockAgentsData: { current: [] as any[] },
  mockInstalledPluginsData: { current: [] as any[] },
  mockUpdatePluginState: { current: { isPending: false, variables: undefined as any } },
}))

vi.mock('@kombuse/ui/base', () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  Collapsible: ({ children, open, ...props }: any) => (
    <div data-testid="collapsible" data-open={String(open)} {...props}>{children}</div>
  ),
  CollapsibleContent: ({ children }: any) => <div data-testid="collapsible-content">{children}</div>,
  CollapsibleTrigger: ({ children, ...props }: any) => <button data-testid="collapsible-trigger" {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  Textarea: (props: any) => <textarea {...props} />,
  Switch: ({ checked, disabled, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      data-testid="plugin-switch"
      onChange={(e: any) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
  ResizableCardHandle: () => <div />,
  ResizableCardPanel: ({ children }: any) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@kombuse/ui/components', () => ({
  AgentCard: ({ agent, profile }: any) => <div data-testid={`agent-${agent.id}`}>{profile?.name ?? agent.id}</div>,
  AgentDetail: () => <div data-testid="agent-detail" />,
  AvatarPicker: () => <div data-testid="avatar-picker" />,
  PromptEditor: () => <div data-testid="prompt-editor" />,
  MobileListDetail: ({ list }: any) => <div>{list}</div>,
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useIsMobile: () => false,
  useAppContext: () => ({ currentProjectId: 'proj-1' }),
  useAgents: () => ({
    data: mockAgentsData.current,
    isLoading: false,
    error: null,
  }),
  useAgentProfiles: () => ({
    data: mockAgentsData.current.map((a: any) => ({ id: a.id, name: a.name ?? a.id })),
  }),
  useAgentWithProfile: () => ({ data: undefined, isLoading: false }),
  useCreateAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAgent: () => ({ mutateAsync: vi.fn() }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
  useToggleAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTriggers: () => ({ data: [] }),
  useCreateTrigger: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTrigger: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTrigger: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleTrigger: () => ({ mutateAsync: vi.fn() }),
  useAvailablePlugins: () => ({ data: [], isLoading: false }),
  useInstalledPlugins: () => ({
    data: mockInstalledPluginsData.current,
    isLoading: false,
  }),
  useInstallPlugin: () => ({ mutate: vi.fn(), isPending: false }),
  useInstallRemotePlugin: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePlugin: () => ({
    mutate: mockUpdatePluginMutate,
    isPending: mockUpdatePluginState.current.isPending,
    variables: mockUpdatePluginState.current.variables,
  }),
  usePluginFiles: () => ({ data: [], isLoading: false }),
  useUpdatePluginFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { Agents } from '../agents'

function renderAgents() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/agents']}>
      <Routes>
        <Route path="/projects/:projectId/agents/:agentId?" element={<Agents />} />
      </Routes>
    </MemoryRouter>
  )
}

const pluginA = {
  id: 'plugin-a',
  name: 'Plugin Alpha',
  is_enabled: true,
  installed_at: '2026-01-01T00:00:00Z',
  version: '1.0.0',
}

const pluginB = {
  id: 'plugin-b',
  name: 'Plugin Beta',
  is_enabled: true,
  installed_at: '2026-01-02T00:00:00Z',
  version: '1.0.0',
}

function makeAgent(id: string, name: string, pluginId: string | null) {
  return {
    id,
    name,
    slug: id,
    description: '',
    is_enabled: true,
    plugin_id: pluginId,
    plugin_base: null,
    project_id: 'proj-1',
    system_prompt: '',
    config: {},
    permissions: [],
  }
}

beforeEach(() => {
  localStorage.clear()
  mockUpdatePluginMutate.mockReset()
  mockUpdatePluginState.current = { isPending: false, variables: undefined }
  mockAgentsData.current = []
  mockInstalledPluginsData.current = []
})

describe('Agents plugin sections', () => {
  it('groups agents by plugin with Custom section last', () => {
    mockInstalledPluginsData.current = [pluginA, pluginB]
    mockAgentsData.current = [
      makeAgent('a1', 'Alpha Agent', 'plugin-a'),
      makeAgent('b1', 'Beta Agent', 'plugin-b'),
      makeAgent('c1', 'Custom Agent', null),
    ]

    renderAgents()

    // All agents rendered
    expect(screen.getByTestId('agent-a1')).toBeDefined()
    expect(screen.getByTestId('agent-b1')).toBeDefined()
    expect(screen.getByTestId('agent-c1')).toBeDefined()

    // Section headers present
    expect(screen.getByText('Plugin Alpha')).toBeDefined()
    expect(screen.getByText('Plugin Beta')).toBeDefined()
    expect(screen.getByText('Custom')).toBeDefined()
  })

  it('calls updatePlugin.mutate with correct args when toggling a plugin switch', () => {
    mockInstalledPluginsData.current = [pluginA]
    mockAgentsData.current = [makeAgent('a1', 'Alpha Agent', 'plugin-a')]

    renderAgents()

    const pluginSwitch = screen.getByTestId('plugin-switch')
    fireEvent.click(pluginSwitch)

    expect(mockUpdatePluginMutate).toHaveBeenCalledWith(
      { id: 'plugin-a', input: { is_enabled: false } },
      expect.objectContaining({ onError: expect.any(Function) })
    )
  })

  it('only disables the switch for the plugin being toggled (per-plugin pending)', () => {
    mockInstalledPluginsData.current = [pluginA, pluginB]
    mockAgentsData.current = [
      makeAgent('a1', 'Alpha Agent', 'plugin-a'),
      makeAgent('b1', 'Beta Agent', 'plugin-b'),
    ]

    // Simulate plugin-a being toggled
    mockUpdatePluginState.current = {
      isPending: true,
      variables: { id: 'plugin-a', input: { is_enabled: false } },
    }

    renderAgents()

    const switches = screen.getAllByTestId('plugin-switch')
    // First switch (plugin-a) should be disabled
    expect(switches[0].getAttribute('disabled')).not.toBeNull()
    // Second switch (plugin-b) should NOT be disabled
    expect(switches[1].getAttribute('disabled')).toBeNull()
  })
})
