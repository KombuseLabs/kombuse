import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import type { Profile as ProfileType } from '@kombuse/types'

const TEST_PROFILE: ProfileType = {
  id: 'user-1',
  type: 'user',
  name: 'Test User',
  email: 'test@example.com',
  description: 'A test description',
  avatar_url: 'bot',
  external_source: null,
  external_id: null,
  is_active: true,
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

const mockMutate = vi.fn()
let mockHookReturn: { data: ProfileType | undefined; isLoading: boolean }

vi.mock('@kombuse/ui/hooks', () => ({
  useCurrentUserProfile: () => mockHookReturn,
  useUpdateProfile: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}))

vi.mock('@kombuse/ui/components', () => ({
  AvatarPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button data-testid="avatar-picker" data-value={value} onClick={() => onChange('zap')}>
      AvatarPicker
    </button>
  ),
  getAvatarIcon: () => {
    return function MockIcon(props: Record<string, unknown>) {
      return <span data-testid="avatar-icon" {...props} />
    }
  },
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
  toast: { success: vi.fn() },
}))

import { Profile } from '../profile'

beforeEach(() => {
  mockMutate.mockReset()
  mockHookReturn = { data: TEST_PROFILE, isLoading: false }
})

describe('Profile page', () => {
  it('should render loading state', () => {
    mockHookReturn = { data: undefined, isLoading: true }
    const { container } = render(<Profile />)
    // The Loader2 icon renders an SVG with the animate-spin class
    expect(container.querySelector('.animate-spin')).toBeDefined()
  })

  it('should render "Profile not found" when no profile data', () => {
    mockHookReturn = { data: undefined, isLoading: false }
    const { getByText } = render(<Profile />)
    expect(getByText('Profile not found')).toBeDefined()
  })

  it('should render profile info', () => {
    const { getByText } = render(<Profile />)
    expect(getByText('Test User')).toBeDefined()
    expect(getByText('test@example.com')).toBeDefined()
    expect(getByText(/Member since/)).toBeDefined()
  })

  it('should render edit form with profile values', () => {
    const { getByDisplayValue } = render(<Profile />)
    expect(getByDisplayValue('Test User')).toBeDefined()
    expect(getByDisplayValue('test@example.com')).toBeDefined()
    expect(getByDisplayValue('A test description')).toBeDefined()
  })

  it('should disable save button when no changes', () => {
    const { getByText } = render(<Profile />)
    const saveButton = getByText('Save Changes').closest('button')!
    expect(saveButton.disabled).toBe(true)
  })

  it('should enable save button after editing name', async () => {
    const { getByDisplayValue, getByText } = render(<Profile />)
    const nameInput = getByDisplayValue('Test User')

    fireEvent.change(nameInput, { target: { value: 'New Name' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(false)
    })
  })

  it('should call mutate with trimmed values on save', async () => {
    const { getByDisplayValue, getByText } = render(<Profile />)

    fireEvent.change(getByDisplayValue('Test User'), { target: { value: '  New Name  ' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(false)
    })

    fireEvent.click(getByText('Save Changes'))

    expect(mockMutate).toHaveBeenCalledOnce()
    const [args] = mockMutate.mock.calls[0]!
    expect(args.id).toBe('user-1')
    expect(args.input.name).toBe('New Name')
    expect(args.input.email).toBe('test@example.com')
  })

  it('should disable save when name is blank', async () => {
    const { getByDisplayValue, getByText } = render(<Profile />)

    fireEvent.change(getByDisplayValue('Test User'), { target: { value: '   ' } })

    await waitFor(() => {
      const saveButton = getByText('Save Changes').closest('button')!
      expect(saveButton.disabled).toBe(true)
    })
  })

  it('should render disabled logout button', () => {
    const { getByText } = render(<Profile />)
    const logoutButton = getByText('Log Out').closest('button')!
    expect(logoutButton.disabled).toBe(true)
  })
})
