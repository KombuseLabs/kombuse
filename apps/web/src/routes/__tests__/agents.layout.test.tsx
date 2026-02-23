import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  mockCreateAgentMutate,
  mockToggleAgentMutate,
  mockPromptEditorProps,
} = vi.hoisted(() => ({
  mockCreateAgentMutate: vi.fn(),
  mockToggleAgentMutate: vi.fn(),
  mockPromptEditorProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('@kombuse/ui/base', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  Input: (props: any) => <input {...props} />,
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  Textarea: (props: any) => <textarea {...props} />,
  ResizableCardHandle: () => <div data-testid="resizable-card-handle" />,
  ResizableCardPanel: ({ children }: any) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  ResizablePanel: ({ children, id }: any) => <div data-testid={`panel-${id}`}>{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />,
  Switch: (props: any) => <input type="checkbox" {...props} />,
  Collapsible: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  toast: vi.fn(),
}))

vi.mock('@kombuse/ui/components', () => ({
  AgentCard: ({ profile }: any) => <div>{profile.name}</div>,
  AgentDetail: () => <div data-testid="agent-detail" />,
  AvatarPicker: () => <div data-testid="avatar-picker" />,
  PromptEditor: (props: any) => {
    mockPromptEditorProps.push(props)
    return (
      <div
        data-testid="create-agent-prompt-editor"
        data-fill-height={String(Boolean(props.fillHeight))}
      />
    )
  },
  MobileListDetail: ({ list, detail, hasSelection }: any) => <div>{hasSelection ? detail : list}</div>,
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useIsMobile: () => false,
  useAppContext: () => ({ currentProjectId: '1' }),
  useAgents: () => ({
    data: [{ id: 'agent-1', is_enabled: true }],
    isLoading: false,
    error: null,
  }),
  useAgentProfiles: () => ({
    data: [{ id: 'agent-1', name: 'Agent One' }],
  }),
  useAgentWithProfile: () => ({
    data: undefined,
    isLoading: false,
  }),
  useCreateAgent: () => ({
    mutate: mockCreateAgentMutate,
    isPending: false,
  }),
  useUpdateAgent: () => ({
    mutateAsync: vi.fn(),
  }),
  useUpdateProfile: () => ({
    mutateAsync: vi.fn(),
  }),
  useToggleAgent: () => ({
    mutate: mockToggleAgentMutate,
    isPending: false,
  }),
  useDeleteAgent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useTriggers: () => ({
    data: [],
  }),
  useCreateTrigger: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateTrigger: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteTrigger: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useToggleTrigger: () => ({
    mutateAsync: vi.fn(),
  }),
  useAvailablePlugins: () => ({ data: [], isLoading: false }),
  useInstalledPlugins: () => ({ data: [], isLoading: false }),
  useInstallPlugin: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePlugin: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePluginFiles: () => ({ data: [], isLoading: false }),
  useUpdatePluginFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { Agents } from '../agents'

function renderCreateRoute() {
  return render(
    <div style={{ height: '320px' }}>
      <MemoryRouter initialEntries={['/projects/1/agents/new']}>
        <Routes>
          <Route path="/projects/:projectId/agents/:agentId" element={<Agents />} />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  mockCreateAgentMutate.mockReset()
  mockToggleAgentMutate.mockReset()
  mockPromptEditorProps.length = 0
})

describe('Agents create layout', () => {
  it('keeps create form scrollable and enables fill-height prompt editor in constrained layouts', () => {
    const { getByTestId, getByText } = renderCreateRoute()

    const formScrollRegion = getByTestId('create-agent-form-scroll')
    const promptSection = getByText('System Prompt *').closest('div') as HTMLElement
    const promptEditor = getByTestId('create-agent-prompt-editor')
    const lastPromptEditorProps = mockPromptEditorProps[mockPromptEditorProps.length - 1]

    expect(formScrollRegion.className).not.toContain('overflow-y-auto')
    expect(formScrollRegion.className).toContain('min-h-0')
    expect(promptSection.className).toContain('flex-1')
    expect(promptSection.className).toContain('min-h-0')
    expect(promptEditor.getAttribute('data-fill-height')).toBe('true')
    expect(lastPromptEditorProps?.fillHeight).toBe(true)
    expect(lastPromptEditorProps?.showAvailableVariables).toBe(true)
  })
})
