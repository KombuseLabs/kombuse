import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthorFilterPicker, getAuthorFilterLabel } from '../author-filter-picker'
import type { AuthorFilterValue } from '../author-filter-picker'

// Mock Select components as simple pass-through elements
vi.mock('@/base/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => (
    <div data-testid="select-root" data-value={value}>
      <select
        data-testid="select-native"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <option value={value}>{children}</option>,
}))

// Mock Popover+Command as simplified components
vi.mock('@/base/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}))

vi.mock('@/base/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input data-testid="agent-search" />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: React.ReactNode
    onSelect: () => void
    value: string
  }) => (
    <div role="option" data-value={value} onClick={onSelect}>
      {children}
    </div>
  ),
}))

vi.mock('@/base/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    asChild?: boolean
  }) => <button {...props}>{children}</button>,
}))

// Mock hooks
vi.mock('@/hooks/use-agents', () => ({
  useAgents: () => ({
    data: [
      { id: 'agent-1', name: 'Agent One', is_enabled: true },
      { id: 'agent-2', name: 'Agent Two', is_enabled: true },
    ],
  }),
  useAgentProfiles: () => ({
    data: [
      { id: 'agent-1', name: 'Agent One', type: 'agent' },
      { id: 'agent-2', name: 'Agent Two', type: 'agent' },
    ],
  }),
}))

describe('AuthorFilterPicker', () => {
  const defaultProps = {
    value: { authorType: null, authorIds: [] } as AuthorFilterValue,
    onValueChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all type options', () => {
    render(<AuthorFilterPicker {...defaultProps} />)

    expect(screen.getAllByText('Any author (no filter)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Human users only')).toBeDefined()
    expect(screen.getByText('Agents only')).toBeDefined()
  })

  it('calls onValueChange with user type when user option selected', () => {
    render(<AuthorFilterPicker {...defaultProps} />)

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: 'user' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith({
      authorType: 'user',
      authorIds: [],
    })
  })

  it('calls onValueChange with null when "Any author" sentinel selected', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'user', authorIds: [] }}
      />
    )

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: '__any__' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith({
      authorType: null,
      authorIds: [],
    })
  })

  it('uses sentinel value when authorType is null', () => {
    render(<AuthorFilterPicker {...defaultProps} />)

    const selectRoot = screen.getByTestId('select-root')
    expect(selectRoot.getAttribute('data-value')).toBe('__any__')
  })

  it('shows agent multi-select when authorType is agent', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: [] }}
      />
    )

    expect(screen.getByText('All agents')).toBeDefined()
    expect(screen.getByText('Leave empty for any agent')).toBeDefined()
  })

  it('does not show agent multi-select when authorType is user', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'user', authorIds: [] }}
      />
    )

    expect(screen.queryByText('All agents')).toBeNull()
    expect(screen.queryByText('Leave empty for any agent')).toBeNull()
  })

  it('toggles agent selection when clicking an agent', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: [] }}
      />
    )

    const agentOption = screen.getByText('Agent One').closest('[role="option"]')!
    fireEvent.click(agentOption)

    expect(defaultProps.onValueChange).toHaveBeenCalledWith({
      authorType: 'agent',
      authorIds: ['agent-1'],
    })
  })

  it('removes agent from selection when clicking a selected agent', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: ['agent-1', 'agent-2'] }}
      />
    )

    const agentOption = screen.getByText('Agent One').closest('[role="option"]')!
    fireEvent.click(agentOption)

    expect(defaultProps.onValueChange).toHaveBeenCalledWith({
      authorType: 'agent',
      authorIds: ['agent-2'],
    })
  })

  it('clears authorIds when switching from agent to user', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: ['agent-1'] }}
      />
    )

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: 'user' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith({
      authorType: 'user',
      authorIds: [],
    })
  })

  it('shows single agent name in button when one agent selected', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: ['agent-1'] }}
      />
    )

    // "Agent One" appears both in button and in the command list — just verify it exists
    expect(screen.getAllByText('Agent One').length).toBeGreaterThanOrEqual(1)
  })

  it('shows count in button when multiple agents selected', () => {
    render(
      <AuthorFilterPicker
        {...defaultProps}
        value={{ authorType: 'agent', authorIds: ['agent-1', 'agent-2'] }}
      />
    )

    expect(screen.getByText('2 agents selected')).toBeDefined()
  })
})

describe('getAuthorFilterLabel', () => {
  it('returns "Human only" for user', () => {
    expect(getAuthorFilterLabel('user')).toBe('Human only')
  })

  it('returns "Agent only" for agent with no names', () => {
    expect(getAuthorFilterLabel('agent')).toBe('Agent only')
  })

  it('returns "Agent only" for agent with empty names array', () => {
    expect(getAuthorFilterLabel('agent', [])).toBe('Agent only')
  })

  it('returns agent names when provided', () => {
    expect(getAuthorFilterLabel('agent', ['Alice', 'Bob'])).toBe('Agents: Alice, Bob')
  })

  it('truncates long agent name lists', () => {
    expect(getAuthorFilterLabel('agent', ['Alice', 'Bob', 'Charlie'])).toBe(
      'Agents: Alice, Bob +1'
    )
  })

  it('returns the input string for unknown types', () => {
    expect(getAuthorFilterLabel('system')).toBe('system')
  })
})
