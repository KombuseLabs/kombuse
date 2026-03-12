import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ActorType, AgentTrigger, AllowedInvoker } from '@kombuse/types'
import { TriggerForm } from '../trigger-form'

interface AuthorFilterValue {
  authorType: ActorType | null
  authorIds: string[]
}

// Track AuthorFilterPicker renders and capture props
const authorFilterPickerRender = vi.fn()

vi.mock('../author-filter-picker', () => ({
  AuthorFilterPicker: (props: {
    value: AuthorFilterValue
    onValueChange: (value: AuthorFilterValue) => void
    disabled?: boolean
  }) => {
    authorFilterPickerRender(props)
    return (
      <div
        data-testid="author-filter-picker"
        data-author-type={props.value.authorType ?? ''}
        data-author-ids={JSON.stringify(props.value.authorIds)}
      >
        <button
          data-testid="pick-user"
          onClick={() => props.onValueChange({ authorType: 'user', authorIds: [] })}
        >
          Pick User
        </button>
        <button
          data-testid="pick-agent-specific"
          onClick={() =>
            props.onValueChange({ authorType: 'agent', authorIds: ['agent-1', 'agent-2'] })
          }
        >
          Pick Specific Agents
        </button>
        <button
          data-testid="pick-agent-all"
          onClick={() => props.onValueChange({ authorType: 'agent', authorIds: [] })}
        >
          Pick All Agents
        </button>
        <button
          data-testid="pick-clear"
          onClick={() => props.onValueChange({ authorType: null, authorIds: [] })}
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

vi.mock('../allowed-invokers-editor', () => ({
  AllowedInvokersEditor: (props: {
    value: AllowedInvoker[] | null
    onChange: (value: AllowedInvoker[] | null) => void
    disabled?: boolean
  }) => (
    <div data-testid="allowed-invokers-editor" data-value={JSON.stringify(props.value)}>
      <button
        data-testid="set-user-only"
        onClick={() => props.onChange([{ type: 'user' }])}
      >
        Set User Only
      </button>
      <button
        data-testid="set-allow-all"
        onClick={() => props.onChange(null)}
      >
        Allow All
      </button>
    </div>
  ),
}))

vi.mock('@/hooks/use-labels', () => ({
  useProjectLabels: () => ({ data: [], isLoading: false }),
  useCreateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-app-context', () => ({
  useAppContext: () => ({ currentProjectId: '1' }),
}))

// Mock base components
vi.mock('@/base/select', () => ({
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

vi.mock('@/base/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/base/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/base/label', () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}))

vi.mock('@/base/switch', () => ({
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
    slug: null,
    agent_id: 'agent-1',
    event_type: 'comment.added',
    project_id: null,
    conditions: null,
    priority: 0,
    is_enabled: true,
    plugin_id: null,
    allowed_invokers: null,
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

  it('shows AuthorFilterPicker when comment.added is selected', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.added' },
    })

    expect(screen.getByTestId('author-filter-picker')).toBeDefined()
  })

  it('shows AuthorFilterPicker when comment.edited is selected', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.edited' },
    })

    expect(screen.getByTestId('author-filter-picker')).toBeDefined()
  })

  it('does NOT show AuthorFilterPicker for non-comment events', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'ticket.created' },
    })

    expect(screen.queryByTestId('author-filter-picker')).toBeNull()
  })

  it('prefills AuthorFilterPicker from existing trigger conditions', () => {
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: { author_type: 'agent' },
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    expect(authorFilterPickerRender).toHaveBeenCalled()
    const lastCall = authorFilterPickerRender.mock.calls.at(-1)?.[0]
    expect(lastCall.value.authorType).toBe('agent')
    expect(lastCall.value.authorIds).toEqual([])
  })

  it('prefills AuthorFilterPicker with author_id from existing trigger', () => {
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: { author_type: 'agent', author_id: ['agent-1'] },
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    const picker = screen.getByTestId('author-filter-picker')
    expect(picker.getAttribute('data-author-type')).toBe('agent')
    expect(picker.getAttribute('data-author-ids')).toBe(JSON.stringify(['agent-1']))
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

  it('submits with author_id array when specific agents selected', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'comment.added' },
    })

    fireEvent.click(screen.getByTestId('pick-agent-specific'))

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'comment.added',
        conditions: expect.objectContaining({
          author_type: 'agent',
          author_id: ['agent-1', 'agent-2'],
        }),
      })
    )
  })

  it('submits without author_id when agent type selected but no specific agents', () => {
    // Pre-build a trigger with author_type: 'agent' already set
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: { author_type: 'agent' },
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    // Verify the picker shows agent type
    const lastCall = authorFilterPickerRender.mock.calls.at(-1)?.[0]
    expect(lastCall.value.authorType).toBe('agent')
    expect(lastCall.value.authorIds).toEqual([])

    // Submit without changing anything — should have author_type but no author_id
    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    expect(defaultProps.onSubmit).toHaveBeenCalled()
    const submitCall = defaultProps.onSubmit.mock.calls[0]?.[0]
    expect(submitCall.event_type).toBe('comment.added')
    expect(submitCall.conditions?.author_type).toBe('agent')
    expect(submitCall.conditions).not.toHaveProperty('author_id')
  })

  it('submits without author_type when no author type is selected', () => {
    const trigger = buildTrigger({
      event_type: 'comment.added',
      conditions: null,
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    // AuthorFilterPicker should be shown with null authorType
    expect(screen.getByTestId('author-filter-picker').getAttribute('data-author-type')).toBe('')

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    const submitCall = defaultProps.onSubmit.mock.calls[0]?.[0]
    // conditions should either be undefined or not contain author_type
    if (submitCall.conditions) {
      expect(submitCall.conditions).not.toHaveProperty('author_type')
    }
  })
})

describe('TriggerForm allowed_invokers', () => {
  const defaultProps = {
    agentId: 'agent-1',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows AllowedInvokersEditor in the form', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'ticket.created' },
    })

    expect(screen.getByTestId('allowed-invokers-editor')).toBeDefined()
  })

  it('submits with allowed_invokers when set', () => {
    render(<TriggerForm {...defaultProps} />)

    fireEvent.change(screen.getByTestId('event-type-select'), {
      target: { value: 'ticket.created' },
    })

    fireEvent.click(screen.getByTestId('set-user-only'))

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_invokers: [{ type: 'user' }],
      })
    )
  })

  it('submits with null allowed_invokers when allow-all is selected', () => {
    const trigger = buildTrigger({
      event_type: 'ticket.created',
      allowed_invokers: [{ type: 'user' }],
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    fireEvent.click(screen.getByTestId('set-allow-all'))

    const form = screen.getByTestId('event-type-select').closest('form')!
    fireEvent.submit(form)

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_invokers: null,
      })
    )
  })

  it('prefills from existing trigger allowed_invokers', () => {
    const trigger = buildTrigger({
      event_type: 'ticket.created',
      allowed_invokers: [{ type: 'agent', agent_type: 'coder' }],
    })

    render(<TriggerForm {...defaultProps} trigger={trigger} />)

    const editor = screen.getByTestId('allowed-invokers-editor')
    expect(editor.getAttribute('data-value')).toBe(
      JSON.stringify([{ type: 'agent', agent_type: 'coder' }])
    )
  })
})
