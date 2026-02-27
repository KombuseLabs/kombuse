import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  mockUpdatePluginMutate,
  mockLabelsData,
  mockInstalledPluginsData,
  mockUpdatePluginState,
} = vi.hoisted(() => ({
  mockUpdatePluginMutate: vi.fn(),
  mockLabelsData: { current: [] as any[] },
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
  LabelCard: ({ label }: any) => <div data-testid={`label-${label.id}`}>{label.name}</div>,
  LabelDetail: () => <div data-testid="label-detail" />,
  LabelForm: () => <div data-testid="label-form" />,
  MobileListDetail: ({ list }: any) => <div>{list}</div>,
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useIsMobile: () => false,
  useAppContext: () => ({ currentProjectId: 'proj-1' }),
  useProjectLabels: () => ({
    data: mockLabelsData.current,
    isLoading: false,
    error: null,
  }),
  useCreateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInstalledPlugins: () => ({
    data: mockInstalledPluginsData.current,
    isLoading: false,
  }),
  useUpdatePlugin: () => ({
    mutate: mockUpdatePluginMutate,
    isPending: mockUpdatePluginState.current.isPending,
    variables: mockUpdatePluginState.current.variables,
  }),
}))

import { Labels } from '../labels'

function renderLabels() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/labels']}>
      <Routes>
        <Route path="/projects/:projectId/labels" element={<Labels />} />
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

function makeLabel(id: number, name: string, pluginId: string | null) {
  return {
    id,
    name,
    color: '#000',
    description: null,
    is_smart: false,
    is_enabled: true,
    plugin_id: pluginId,
    plugin_base: null,
    project_id: 'proj-1',
  }
}

beforeEach(() => {
  localStorage.clear()
  mockUpdatePluginMutate.mockReset()
  mockUpdatePluginState.current = { isPending: false, variables: undefined }
  mockLabelsData.current = []
  mockInstalledPluginsData.current = []
})

describe('Labels plugin sections', () => {
  it('groups labels by plugin with Custom section last', () => {
    mockInstalledPluginsData.current = [pluginA, pluginB]
    mockLabelsData.current = [
      makeLabel(1, 'Alpha Label', 'plugin-a'),
      makeLabel(2, 'Beta Label', 'plugin-b'),
      makeLabel(3, 'Custom Label', null),
    ]

    renderLabels()

    // All labels should be rendered
    expect(screen.getByTestId('label-1').textContent).toBe('Alpha Label')
    expect(screen.getByTestId('label-2').textContent).toBe('Beta Label')
    expect(screen.getByTestId('label-3').textContent).toBe('Custom Label')

    // Section headers should include plugin names and "Custom"
    expect(screen.getByText('Plugin Alpha')).toBeDefined()
    expect(screen.getByText('Plugin Beta')).toBeDefined()
    expect(screen.getByText('Custom')).toBeDefined()
  })

  it('filters out empty plugin sections when search removes all labels from a plugin', () => {
    mockInstalledPluginsData.current = [pluginA, pluginB]
    mockLabelsData.current = [
      makeLabel(1, 'Alpha Label', 'plugin-a'),
      makeLabel(2, 'Beta Unique', 'plugin-b'),
      makeLabel(3, 'Custom Label', null),
    ]

    renderLabels()

    // Type a search query that only matches plugin-b's label
    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'Unique' } })

    // Plugin Alpha section should be gone (no matching labels)
    expect(screen.queryByText('Plugin Alpha')).toBeNull()
    // Plugin Beta section should still be visible
    expect(screen.getByText('Plugin Beta')).toBeDefined()
    // Custom section should be gone (no matching labels)
    expect(screen.queryByText('Custom')).toBeNull()
  })

  it('calls updatePlugin.mutate with correct args when toggling a plugin switch', () => {
    mockInstalledPluginsData.current = [pluginA]
    mockLabelsData.current = [makeLabel(1, 'Alpha Label', 'plugin-a')]

    renderLabels()

    const pluginSwitch = screen.getByTestId('plugin-switch')
    fireEvent.click(pluginSwitch)

    expect(mockUpdatePluginMutate).toHaveBeenCalledWith(
      { id: 'plugin-a', input: { is_enabled: false } },
      expect.objectContaining({ onError: expect.any(Function) })
    )
  })

  it('only disables the switch for the plugin being toggled (per-plugin pending)', () => {
    mockInstalledPluginsData.current = [pluginA, pluginB]
    mockLabelsData.current = [
      makeLabel(1, 'Alpha Label', 'plugin-a'),
      makeLabel(2, 'Beta Label', 'plugin-b'),
    ]

    // Simulate plugin-a being toggled
    mockUpdatePluginState.current = {
      isPending: true,
      variables: { id: 'plugin-a', input: { is_enabled: false } },
    }

    renderLabels()

    const switches = screen.getAllByTestId('plugin-switch')
    // First switch (plugin-a) should be disabled
    expect(switches[0].getAttribute('disabled')).not.toBeNull()
    // Second switch (plugin-b) should NOT be disabled
    expect(switches[1].getAttribute('disabled')).toBeNull()
  })
})
