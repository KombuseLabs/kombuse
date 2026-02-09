import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { SerializedAgentPermissionRequestEvent, JsonObject } from '@kombuse/types'
import { AskUserBar } from '../ask-user-bar'

function makePermission(
  questions: Array<Record<string, unknown>>
): SerializedAgentPermissionRequestEvent {
  return {
    type: 'permission_request',
    eventId: 'evt-1',
    backend: 'mock',
    timestamp: Date.now(),
    requestId: 'req-1',
    toolName: 'AskUserQuestion',
    toolUseId: 'tu-1',
    input: { questions } as unknown as JsonObject,
  }
}

const singleQuestion = [
  {
    question: 'Which library?',
    header: 'Library',
    options: [
      { label: 'React', description: 'Component library' },
      { label: 'Vue', description: 'Progressive framework' },
    ],
    multiSelect: false,
  },
]

const multiQuestion = [
  {
    question: 'Which features?',
    header: 'Features',
    options: [
      { label: 'Auth', description: 'Authentication' },
      { label: 'DB', description: 'Database' },
      { label: 'API', description: 'REST API' },
    ],
    multiSelect: true,
  },
]

const twoQuestions = [
  {
    question: 'Which library?',
    header: 'Library',
    options: [{ label: 'React' }, { label: 'Vue' }],
    multiSelect: false,
  },
  {
    question: 'Which approach?',
    header: 'Approach',
    options: [{ label: 'Simple' }, { label: 'Complex' }],
    multiSelect: false,
  },
]

describe('AskUserBar', () => {
  it('renders question text and all options', () => {
    const onRespond = vi.fn()
    const { getByText } = render(
      <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
    )

    expect(getByText('Library')).toBeDefined()
    expect(getByText('Which library?')).toBeDefined()
    expect(getByText('React')).toBeDefined()
    expect(getByText('Vue')).toBeDefined()
    expect(getByText('Other...')).toBeDefined()
  })

  it('renders option descriptions', () => {
    const onRespond = vi.fn()
    const { getByText } = render(
      <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
    )

    expect(getByText('Component library')).toBeDefined()
    expect(getByText('Progressive framework')).toBeDefined()
  })

  describe('single-select', () => {
    it('selects an option on click', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('React'))
      fireEvent.click(getByText('Submit'))

      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({ Library: 'React' })
    })

    it('clicking another option deselects the first', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('React'))
      fireEvent.click(getByText('Vue'))
      fireEvent.click(getByText('Submit'))

      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({ Library: 'Vue' })
    })
  })

  describe('multi-select', () => {
    it('toggles options independently', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(multiQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('Auth'))
      fireEvent.click(getByText('API'))
      fireEvent.click(getByText('Submit'))

      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({ Features: 'Auth, API' })
    })

    it('deselecting all disables submit', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(multiQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('Auth'))
      fireEvent.click(getByText('Auth')) // deselect

      const submitBtn = getByText('Submit').closest('button')!
      expect(submitBtn.disabled).toBe(true)
    })
  })

  describe('Other option', () => {
    it('shows text input when Other is clicked', () => {
      const onRespond = vi.fn()
      const { getByText, getByPlaceholderText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('Other...'))
      expect(getByPlaceholderText('Type your answer...')).toBeDefined()
    })

    it('submits with other text value', () => {
      const onRespond = vi.fn()
      const { getByText, getByPlaceholderText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('Other...'))
      const input = getByPlaceholderText('Type your answer...')
      fireEvent.change(input, { target: { value: 'Svelte' } })
      fireEvent.click(getByText('Submit'))

      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({ Library: 'Svelte' })
    })
  })

  describe('submit gating', () => {
    it('submit is disabled until all questions are answered', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(twoQuestions)} onRespond={onRespond} />
      )

      const submitBtn = getByText('Submit').closest('button')!
      expect(submitBtn.disabled).toBe(true)

      // Answer first question only
      fireEvent.click(getByText('React'))
      expect(submitBtn.disabled).toBe(true)

      // Answer second question
      fireEvent.click(getByText('Simple'))
      expect(submitBtn.disabled).toBe(false)
    })

    it('does not call onRespond when submit is disabled', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('Submit'))
      expect(onRespond).not.toHaveBeenCalled()
    })
  })

  describe('updatedInput payload', () => {
    it('includes original input fields plus answers', () => {
      const onRespond = vi.fn()
      const { getByText } = render(
        <AskUserBar permission={makePermission(singleQuestion)} onRespond={onRespond} />
      )

      fireEvent.click(getByText('React'))
      fireEvent.click(getByText('Submit'))

      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      // Should contain original questions array
      expect(call.questions).toEqual(singleQuestion)
      // Plus the answers
      expect(call.answers).toEqual({ Library: 'React' })
    })
  })

  describe('malformed input', () => {
    it('renders nothing when questions is missing', () => {
      const onRespond = vi.fn()
      const permission = {
        ...makePermission([]),
        input: { notQuestions: true },
      } as unknown as SerializedAgentPermissionRequestEvent
      const { container } = render(
        <AskUserBar permission={permission} onRespond={onRespond} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders nothing when questions has invalid structure', () => {
      const onRespond = vi.fn()
      const permission = makePermission([{ bad: 'data' }])
      const { container } = render(
        <AskUserBar permission={permission} onRespond={onRespond} />
      )
      expect(container.innerHTML).toBe('')
    })
  })
})
