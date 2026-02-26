import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import type { Project } from '@kombuse/types'

const TEST_PROJECT: Project = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  owner_id: 'user-1',
  local_path: '/home/user/projects/test',
  repo_source: 'github',
  repo_owner: 'testorg',
  repo_name: 'testrepo',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-16T00:00:00Z',
}

const mockMutate = vi.fn()
let mockProjectReturn: { data: Project | undefined; isLoading: boolean }

vi.mock('react-router-dom', () => ({
  useParams: () => ({ projectId: 'proj-1' }),
}))

const mockInitMutate = vi.fn()

vi.mock('@kombuse/ui/hooks', () => ({
  useProject: () => mockProjectReturn,
  useUpdateProject: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useInitProject: () => ({
    mutate: mockInitMutate,
    isPending: false,
    data: undefined,
  }),
  useDesktop: () => ({
    isDesktop: false,
    selectDirectory: vi.fn(),
  }),
}))

vi.mock('@kombuse/ui/base', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) => (
    <div data-testid="select" data-value={value}>
      {children}
      <select data-testid="select-native" value={value} onChange={(e) => onValueChange(e.target.value)}>
        <option value="none">None</option>
        <option value="github">GitHub</option>
        <option value="gitlab">GitLab</option>
        <option value="bitbucket">Bitbucket</option>
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import { ProjectPage } from '../project'

beforeEach(() => {
  mockMutate.mockReset()
  mockInitMutate.mockReset()
  mockProjectReturn = { data: TEST_PROJECT, isLoading: false }
})

describe('ProjectPage', () => {
  it('should render loading state', () => {
    mockProjectReturn = { data: undefined, isLoading: true }
    const { container } = render(<ProjectPage />)
    expect(container.querySelector('.animate-spin')).toBeDefined()
  })

  it('should render "Project not found" when no project data', () => {
    mockProjectReturn = { data: undefined, isLoading: false }
    const { getByText } = render(<ProjectPage />)
    expect(getByText('Project not found')).toBeDefined()
  })

  it('should render form with project values', () => {
    const { getByDisplayValue } = render(<ProjectPage />)
    expect(getByDisplayValue('Test Project')).toBeDefined()
    expect(getByDisplayValue('A test project')).toBeDefined()
    expect(getByDisplayValue('/home/user/projects/test')).toBeDefined()
    // Repository section is hidden behind {false && (...)} — repo fields not rendered
  })

  it('should disable save button when no changes', () => {
    const { getByText } = render(<ProjectPage />)
    const saveButton = getByText('Save Changes').closest('button')!
    expect(saveButton.disabled).toBe(true)
  })

  it('should enable save button after editing name', async () => {
    const { getByDisplayValue, getByText } = render(<ProjectPage />)
    const nameInput = getByDisplayValue('Test Project')

    fireEvent.change(nameInput, { target: { value: 'New Name' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(false)
    })
  })

  it('should call mutate with correct payload on save', async () => {
    const { getByDisplayValue, getByText } = render(<ProjectPage />)

    fireEvent.change(getByDisplayValue('Test Project'), { target: { value: '  New Name  ' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(false)
    })

    fireEvent.click(getByText('Save Changes'))

    expect(mockMutate).toHaveBeenCalledOnce()
    const [args] = mockMutate.mock.calls[0]!
    expect(args.id).toBe('proj-1')
    expect(args.input.name).toBe('New Name')
    expect(args.input.repo_source).toBe('github')
    expect(args.input.repo_owner).toBe('testorg')
  })

  it('should map "none" repo source to undefined on save', async () => {
    mockProjectReturn = {
      data: { ...TEST_PROJECT, repo_source: null, repo_owner: null, repo_name: null },
      isLoading: false,
    }
    const { getByDisplayValue, getByText } = render(<ProjectPage />)

    fireEvent.change(getByDisplayValue('Test Project'), { target: { value: 'Changed' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(false)
    })

    fireEvent.click(getByText('Save Changes'))

    expect(mockMutate).toHaveBeenCalledOnce()
    const [args] = mockMutate.mock.calls[0]!
    expect(args.input.repo_source).toBeUndefined()
  })

  it('should disable save when name is blank', async () => {
    const { getByDisplayValue, getByText } = render(<ProjectPage />)

    fireEvent.change(getByDisplayValue('Test Project'), { target: { value: '   ' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(true)
    })
  })

  it('should render enabled init button when project has local_path', () => {
    const { getByText } = render(<ProjectPage />)
    const initButton = getByText('Initialize Project').closest('button')!
    expect(initButton.disabled).toBe(false)
  })

  it('should render disabled init button when project has no local_path', () => {
    mockProjectReturn = {
      data: { ...TEST_PROJECT, local_path: null },
      isLoading: false,
    }
    const { getByText } = render(<ProjectPage />)
    const initButton = getByText('Initialize Project').closest('button')!
    expect(initButton.disabled).toBe(true)
  })
})
