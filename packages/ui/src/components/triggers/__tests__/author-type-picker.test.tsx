import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthorTypePicker, getAuthorTypeLabel } from '../author-type-picker'

// Mock Select components as simple pass-through elements
vi.mock('../../../base/select', () => ({
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

describe('AuthorTypePicker', () => {
  const defaultProps = {
    value: null as import('@kombuse/types').ActorType | null,
    onValueChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all options including the "Any author" clear option', () => {
    render(<AuthorTypePicker {...defaultProps} />)

    // "Any author (no filter)" appears both as a SelectItem and as the SelectValue placeholder
    expect(screen.getAllByText('Any author (no filter)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Human users only')).toBeDefined()
    expect(screen.getByText('Agents only')).toBeDefined()
  })

  it('calls onValueChange with "user" when user option selected', () => {
    render(<AuthorTypePicker {...defaultProps} />)

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: 'user' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith('user')
  })

  it('calls onValueChange with "agent" when agent option selected', () => {
    render(<AuthorTypePicker {...defaultProps} />)

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: 'agent' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith('agent')
  })

  it('calls onValueChange with null when "Any author" sentinel selected', () => {
    render(<AuthorTypePicker {...defaultProps} value="user" />)

    fireEvent.change(screen.getByTestId('select-native'), {
      target: { value: '__any__' },
    })

    expect(defaultProps.onValueChange).toHaveBeenCalledWith(null)
  })

  it('uses sentinel value when value prop is null', () => {
    render(<AuthorTypePicker {...defaultProps} value={null} />)

    const selectRoot = screen.getByTestId('select-root')
    expect(selectRoot.getAttribute('data-value')).toBe('__any__')
  })
})

describe('getAuthorTypeLabel', () => {
  it('returns "Human only" for user', () => {
    expect(getAuthorTypeLabel('user')).toBe('Human only')
  })

  it('returns "Agent only" for agent', () => {
    expect(getAuthorTypeLabel('agent')).toBe('Agent only')
  })

  it('returns the input string for unknown types', () => {
    expect(getAuthorTypeLabel('system')).toBe('system')
  })
})
