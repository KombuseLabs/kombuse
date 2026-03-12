import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Label } from '@kombuse/types'
import { LabelSelector } from '../label-selector'

// Mock Popover to always render open
vi.mock('@/base/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock useSmartLabels (requires AppProvider context)
vi.mock('@/hooks/use-app-context', () => ({
  useSmartLabels: () => ({
    smartLabelIds: new Set<number>(),
    isSmartLabel: () => false,
  }),
}))

// Mock Command components as simple pass-through elements
vi.mock('@/base/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input placeholder="Search labels..." />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
  CommandSeparator: () => <hr />,
}))

const buildLabel = (overrides: Partial<Label> = {}): Label => ({
  id: 1,
  name: 'Bug',
  slug: 'bug',
  color: '#d73a4a',
  description: null,
  plugin_id: null,
  is_enabled: true,
  project_id: '1',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('LabelSelector', () => {
  const defaultProps = {
    availableLabels: [buildLabel(), buildLabel({ id: 2, name: 'Feature', color: '#22c55e' })],
    selectedLabelIds: [] as number[],
    onLabelAdd: vi.fn(),
    onLabelRemove: vi.fn(),
    onLabelCreate: vi.fn<(data: { name: string; color: string }) => Promise<Label | void>>(),
    onLabelUpdate: vi.fn(),
    onLabelDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders available labels', () => {
    render(<LabelSelector {...defaultProps} />)
    expect(screen.getByText('Bug')).toBeDefined()
    expect(screen.getByText('Feature')).toBeDefined()
  })

  it('selects an unselected label via onLabelAdd', () => {
    render(<LabelSelector {...defaultProps} />)
    fireEvent.click(screen.getByText('Bug'))
    expect(defaultProps.onLabelAdd).toHaveBeenCalledWith(1)
  })

  it('deselects a selected label via onLabelRemove', () => {
    render(<LabelSelector {...defaultProps} selectedLabelIds={[1]} />)
    fireEvent.click(screen.getByText('Bug'))
    expect(defaultProps.onLabelRemove).toHaveBeenCalledWith(1)
  })

  describe('create + auto-assign', () => {
    it('auto-assigns newly created label on successful create', async () => {
      const createdLabel = buildLabel({ id: 99, name: 'Urgent', color: '#ef4444' })
      defaultProps.onLabelCreate.mockResolvedValueOnce(createdLabel)

      render(<LabelSelector {...defaultProps} />)

      // Click "Create new label"
      fireEvent.click(screen.getByText('Create new label'))

      // Fill in the form and submit
      const nameInput = screen.getByPlaceholderText('Label name')
      fireEvent.change(nameInput, { target: { value: 'Urgent' } })
      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        expect(defaultProps.onLabelCreate).toHaveBeenCalledWith({
          name: 'Urgent',
          color: '#58a6ff',
          description: undefined,
        })
        expect(defaultProps.onLabelAdd).toHaveBeenCalledWith(99)
      })
    })

    it('does not call onLabelAdd when onLabelCreate returns void', async () => {
      defaultProps.onLabelCreate.mockResolvedValueOnce(undefined)

      render(<LabelSelector {...defaultProps} />)

      fireEvent.click(screen.getByText('Create new label'))

      const nameInput = screen.getByPlaceholderText('Label name')
      fireEvent.change(nameInput, { target: { value: 'New Label' } })
      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        expect(defaultProps.onLabelCreate).toHaveBeenCalled()
      })
      expect(defaultProps.onLabelAdd).not.toHaveBeenCalled()
    })

    it('does not call onLabelAdd when onLabelCreate rejects and stays in create mode', async () => {
      defaultProps.onLabelCreate.mockRejectedValueOnce(new Error('create failed'))

      render(<LabelSelector {...defaultProps} />)

      fireEvent.click(screen.getByText('Create new label'))

      const nameInput = screen.getByPlaceholderText('Label name')
      fireEvent.change(nameInput, { target: { value: 'Broken' } })
      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        expect(defaultProps.onLabelCreate).toHaveBeenCalled()
      })
      expect(defaultProps.onLabelAdd).not.toHaveBeenCalled()
      // Should stay in create mode so user can retry (form still visible)
      expect(screen.getByPlaceholderText('Label name')).toBeDefined()
    })

    it('shows newly created label in selector before refetch via pendingLabel', async () => {
      const createdLabel = buildLabel({ id: 99, name: 'Urgent', color: '#ef4444' })
      defaultProps.onLabelCreate.mockResolvedValueOnce(createdLabel)

      render(<LabelSelector {...defaultProps} />)

      fireEvent.click(screen.getByText('Create new label'))

      const nameInput = screen.getByPlaceholderText('Label name')
      fireEvent.change(nameInput, { target: { value: 'Urgent' } })
      fireEvent.click(screen.getByText('Create'))

      // After create, should switch back to select mode showing the new label
      await waitFor(() => {
        expect(screen.getByText('Urgent')).toBeDefined()
      })
    })
  })
})
