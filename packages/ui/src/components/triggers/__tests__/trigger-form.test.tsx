import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ActorType, AgentTrigger } from '@kombuse/types'
import { TriggerForm } from '../trigger-form'

// Track AuthorTypePicker renders and capture props
const authorTypePickerRender = vi.fn()

vi.mock('../author-type-picker', () => ({
  AuthorTypePicker: (props: {
    value: ActorType | null
    onValueChange: (value: ActorType | null) => void
    disabled?: boolean
  }) => {
    authorTypePickerRender(props)
    return (
      <div data-testid="author-type-picker" data-value={props.value ?? ''}>
        <button
          data-testid="pick-user"
          onClick={() => props.onValueChange('user')}
        >
          Pick User
        </button>
        <button
          data-testid="pick-clear"
          onClick={() => props.onValueChange(null)}
        >
          Clear
        </button>
      </div>
    )
  },
}))

vi.mock('../mention-type-picker', () => ({
  MentionTypePicker: () => <div data-testid="mention-type-picker" />,
}))

vi.mock('../condition-editor', () => ({
  ConditionEditor: () => <div data-testid="condition-editor" />,
}))

vi.mock('../../labels/label-picker', () => ({
  LabelPicker: () => <div data-testid="label-picker" />,
}))

vi.mock('../../../hooks/use-labels', () => ({
  useProjectLabels: () => ({ data: [], isLoading: false }),
  useCreateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../../hooks/use-app-context', () => ({
  useAppContext: () => ({ currentProjectId: '1' }),
}))

// Mock base components
vi.mock('../../../base/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (v: string) => void
  }) => (
    <div>
      <select
        data-testid="event-type-select"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">Select...</option>
        <option value="comment.added">Comment Added</option>
        <option value="comment.edited">Comment Edited</option>
        <option value="ticket.created">Ticket Created</option>
        <option value="mention.created">Mention Created</option>
      </select>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: () => null,
  SelectLabel: () => null,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

vi.mock('../../../base/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('../../../base/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('../../../base/label', () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}))

vi.mock('../../../base/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    id?: string
    'aria-label'?: string
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
}))

function buildTrigger(overrides: Partial<AgentTrigger> = {}): AgentTrigger {
  return {
    id: 1,
    agent_id: 'agent-1',
    event_type: 'comment.added',
    project_id: null,
    conditions: null,
    priority: 0,
    is_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('TriggerForm comment-event behavior', () => {
  const defaultProps = {
    agentId: 'agent-1',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows AuthorTypePicker when comment.added is selected', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.added' },
    })

    expect(screen.getByTestId('author-type-picker')).toBeDefined()
  })

  it('shows AuthorTypePicker when comment.edited is selected', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.edited' },
    })

    expect(screen.getByTestId('author-type-picker')).toBeDefined()
  })

  it('does NOT show AuthorTypePicker for non-comment events', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'ticket.created' },
    })

    expect(screen.queryByTestId('author-type-picker')).toBeNull()
  })

  it('prefills AuthorTypePicker from existing trigger conditions', () => {
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: { author_type: 'agent' },
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    expect(authorTypePickerRender).toHaveBeenCalled()
    const lastCall = authorTypePickerRender.mock.calls.at(-1)?.[0]
    expect(lastCall.value).toBe('agent')
  })

  it('submits with author_type in conditions when set', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.added' },
    })

    fireEvent.click(screen.getByTestId('pick-user'))

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'comment.added',
        conditions: expect.objectContaining({ author_type: 'user' }),
      })
    )
  })

  it('submits without author_type when no author type is selected', () => {
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: null,
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    // AuthorTypePicker should be shown with null value (no filter selected)
    expect(screen.getByTestId('author-type-picker').getAttribute('data-value')).toBe('')

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    const submitCall = defaultProps.onSubmit.mock.calls[0]?.[0]
    // conditions should either be undefined or not contain author_type
    if (submitCall.conditions) {
      expect(submitCall.conditions).not.toHaveProperty('author_type')
    }
  })
})
