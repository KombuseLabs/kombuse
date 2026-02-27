import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { SerializedAgentPermissionRequestEvent, JsonObject } from '@kombuse/types'
import { AskUserDialog } from '../ask-user-dialog'
import { AGENT_CHOICE_SENTINEL } from '../ask-user-types'

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

const threeQuestions = [
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
  {
    question: 'Which style?',
    header: 'Style',
    options: [{ label: 'Minimal' }, { label: 'Full' }],
    multiSelect: false,
  },
]

describe('AskUserDialog', () => {
  let onRespond: ReturnType<typeof vi.fn>
  let onDeny: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onRespond = vi.fn()
    onDeny = vi.fn()
  })

  describe('rendering', () => {
    it('renders nothing when permission is null', () => {
      const { container } = render(
        <AskUserDialog permission={null} onRespond={onRespond} onDeny={onDeny} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders nothing for malformed input', () => {
      const permission = {
        ...makePermission([]),
        input: { notQuestions: true },
      } as unknown as SerializedAgentPermissionRequestEvent
      const { container } = render(
        <AskUserDialog permission={permission} onRespond={onRespond} onDeny={onDeny} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders question text and all options', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Library')).toBeDefined()
      expect(screen.getByText('Which library?')).toBeDefined()
      expect(screen.getByText('React')).toBeDefined()
      expect(screen.getByText('Vue')).toBeDefined()
      expect(screen.getByText('Other...')).toBeDefined()
    })

    it('renders option descriptions', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Component library')).toBeDefined()
      expect(screen.getByText('Progressive framework')).toBeDefined()
    })

    it('renders "Your call" button', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Your call')).toBeDefined()
    })

    it('renders metadata context when present', () => {
      const questions = [
        {
          ...singleQuestion[0],
          metadata: { context: 'This affects architecture' },
        },
      ]
      render(
        <AskUserDialog permission={makePermission(questions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('This affects architecture')).toBeDefined()
    })

    it('renders metadata confidence when present', () => {
      const questions = [
        {
          ...singleQuestion[0],
          metadata: { confidence: 'Low confidence — your input matters' },
        },
      ]
      render(
        <AskUserDialog permission={makePermission(questions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Low confidence — your input matters')).toBeDefined()
    })
  })

  describe('compact mode (1-2 questions)', () => {
    it('shows all questions on a single page', () => {
      render(
        <AskUserDialog permission={makePermission(twoQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Which library?')).toBeDefined()
      expect(screen.getByText('Which approach?')).toBeDefined()
    })

    it('does not show step indicator', () => {
      render(
        <AskUserDialog permission={makePermission(twoQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.queryByText(/Step \d+ of \d+/)).toBeNull()
    })

    describe('single-select', () => {
      it('selects an option on click', () => {
        render(
          <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('React'))
        fireEvent.click(screen.getByText('Submit'))

        expect(onRespond).toHaveBeenCalledOnce()
        const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
        expect(call.answers).toEqual({ Library: 'React' })
      })

      it('clicking another option deselects the first', () => {
        render(
          <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('React'))
        fireEvent.click(screen.getByText('Vue'))
        fireEvent.click(screen.getByText('Submit'))

        expect(onRespond).toHaveBeenCalledOnce()
        const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
        expect(call.answers).toEqual({ Library: 'Vue' })
      })
    })

    describe('multi-select', () => {
      it('toggles options independently', () => {
        render(
          <AskUserDialog permission={makePermission(multiQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('Auth'))
        fireEvent.click(screen.getByText('API'))
        fireEvent.click(screen.getByText('Submit'))

        expect(onRespond).toHaveBeenCalledOnce()
        const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
        expect(call.answers).toEqual({ Features: 'Auth, API' })
      })

      it('deselecting all disables submit', () => {
        render(
          <AskUserDialog permission={makePermission(multiQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('Auth'))
        fireEvent.click(screen.getByText('Auth')) // deselect

        const submitBtn = screen.getByText('Submit').closest('button')!
        expect(submitBtn.disabled).toBe(true)
      })
    })

    describe('Other option', () => {
      it('shows text input when Other is clicked', () => {
        render(
          <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('Other...'))
        expect(screen.getByPlaceholderText('Type your answer...')).toBeDefined()
      })

      it('submits with other text value', () => {
        render(
          <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('Other...'))
        const input = screen.getByPlaceholderText('Type your answer...')
        fireEvent.change(input, { target: { value: 'Svelte' } })
        fireEvent.click(screen.getByText('Submit'))

        expect(onRespond).toHaveBeenCalledOnce()
        const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
        expect(call.answers).toEqual({ Library: 'Svelte' })
      })
    })

    describe('submit gating', () => {
      it('submit is disabled until all questions are answered', () => {
        render(
          <AskUserDialog permission={makePermission(twoQuestions)} onRespond={onRespond} onDeny={onDeny} />
        )

        const submitBtn = screen.getByText('Submit').closest('button')!
        expect(submitBtn.disabled).toBe(true)

        // Answer first question only
        fireEvent.click(screen.getByText('React'))
        expect(submitBtn.disabled).toBe(true)

        // Answer second question
        fireEvent.click(screen.getByText('Simple'))
        expect(submitBtn.disabled).toBe(false)
      })

      it('does not call onRespond when submit is disabled', () => {
        render(
          <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
        )

        fireEvent.click(screen.getByText('Submit'))
        expect(onRespond).not.toHaveBeenCalled()
      })
    })
  })

  describe('wizard mode (3+ questions)', () => {
    it('shows step indicator', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Step 1 of 3')).toBeDefined()
    })

    it('shows only the first question initially', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      expect(screen.getByText('Which library?')).toBeDefined()
      expect(screen.queryByText('Which approach?')).toBeNull()
      expect(screen.queryByText('Which style?')).toBeNull()
    })

    it('Next button is disabled until question is answered', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      const nextBtn = screen.getByText('Next').closest('button')!
      expect(nextBtn.disabled).toBe(true)

      fireEvent.click(screen.getByText('React'))
      expect(nextBtn.disabled).toBe(false)
    })

    it('navigates forward and backward', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Step 1: answer and advance
      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Next'))
      expect(screen.getByText('Step 2 of 3')).toBeDefined()
      expect(screen.getByText('Which approach?')).toBeDefined()

      // Step 2: go back
      fireEvent.click(screen.getByText('Back'))
      expect(screen.getByText('Step 1 of 3')).toBeDefined()
      expect(screen.getByText('Which library?')).toBeDefined()
    })

    it('shows review step after answering all questions', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Answer step 1
      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Next'))

      // Answer step 2
      fireEvent.click(screen.getByText('Simple'))
      fireEvent.click(screen.getByText('Next'))

      // Answer step 3
      fireEvent.click(screen.getByText('Minimal'))
      fireEvent.click(screen.getByText('Next'))

      // Review step
      expect(screen.getByText('Review Answers')).toBeDefined()
      expect(screen.getByText('React')).toBeDefined()
      expect(screen.getByText('Simple')).toBeDefined()
      expect(screen.getByText('Minimal')).toBeDefined()
    })

    it('allows click-to-edit from review', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Answer all and get to review
      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Next'))
      fireEvent.click(screen.getByText('Simple'))
      fireEvent.click(screen.getByText('Next'))
      fireEvent.click(screen.getByText('Minimal'))
      fireEvent.click(screen.getByText('Next'))

      // Click on the first question in review
      const libraryRow = screen.getByText('Library').closest('button')!
      fireEvent.click(libraryRow)

      // Should go back to step 1
      expect(screen.getByText('Step 1 of 3')).toBeDefined()
    })

    it('submits from review step', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Answer all
      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Next'))
      fireEvent.click(screen.getByText('Simple'))
      fireEvent.click(screen.getByText('Next'))
      fireEvent.click(screen.getByText('Minimal'))
      fireEvent.click(screen.getByText('Next'))

      // Submit from review
      fireEvent.click(screen.getByText('Submit'))

      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({
        Library: 'React',
        Approach: 'Simple',
        Style: 'Minimal',
      })
    })
  })

  describe('agent choice', () => {
    it('"Your call" sets sentinel answer', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('Your call'))
      expect(screen.getByText('Agent decides')).toBeDefined()

      fireEvent.click(screen.getByText('Submit'))

      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({ Library: AGENT_CHOICE_SENTINEL })
    })

    it('"Your call" can be undone with Change button', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('Your call'))
      expect(screen.getByText('Agent decides')).toBeDefined()

      fireEvent.click(screen.getByText('Change'))

      // Should be back to normal options
      expect(screen.getByText('React')).toBeDefined()
      expect(screen.getByText('Vue')).toBeDefined()

      // Submit should now be disabled (no answer selected)
      const submitBtn = screen.getByText('Submit').closest('button')!
      expect(submitBtn.disabled).toBe(true)
    })

    it('"Skip all" fills unanswered questions with sentinel', () => {
      render(
        <AskUserDialog permission={makePermission(twoQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Answer first question normally
      fireEvent.click(screen.getByText('React'))

      // Skip all — should fill second question
      fireEvent.click(screen.getByText('Skip all — agent decides'))

      fireEvent.click(screen.getByText('Submit'))

      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({
        Library: 'React',
        Approach: AGENT_CHOICE_SENTINEL,
      })
    })

    it('"Skip all" in wizard mode jumps to review', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('Skip all — agent decides'))

      // Should be on review step
      expect(screen.getByText('Review Answers')).toBeDefined()
    })

    it('"Skip all" does not overwrite existing answers', () => {
      render(
        <AskUserDialog permission={makePermission(threeQuestions)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Answer first question
      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Next'))

      // Skip all from step 2
      fireEvent.click(screen.getByText('Skip all — agent decides'))

      // Submit from review
      fireEvent.click(screen.getByText('Submit'))

      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      expect(call.answers).toEqual({
        Library: 'React',
        Approach: AGENT_CHOICE_SENTINEL,
        Style: AGENT_CHOICE_SENTINEL,
      })
    })
  })

  describe('dismiss behavior', () => {
    it('calls onDeny when no answers and dialog is closed', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Find the close button (X) in the dialog
      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)

      expect(onDeny).toHaveBeenCalledOnce()
    })

    it('shows confirmation when answers exist and dialog is closed', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Select an answer
      fireEvent.click(screen.getByText('React'))

      // Try to close
      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)

      // Should show confirm prompt
      expect(screen.getByText('Discard your answers?')).toBeDefined()
      expect(onDeny).not.toHaveBeenCalled()
    })

    it('discarding answers calls onDeny', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('React'))

      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)

      fireEvent.click(screen.getByText('Discard'))
      expect(onDeny).toHaveBeenCalledOnce()
    })

    it('cancelling dismiss returns to dialog', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('React'))

      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)

      fireEvent.click(screen.getByText('Cancel'))

      // Should be back to normal dialog
      expect(screen.queryByText('Discard your answers?')).toBeNull()
      expect(screen.getByText('Which library?')).toBeDefined()
    })
  })

  describe('updatedInput payload', () => {
    it('includes original input fields plus answers', () => {
      render(
        <AskUserDialog permission={makePermission(singleQuestion)} onRespond={onRespond} onDeny={onDeny} />
      )

      fireEvent.click(screen.getByText('React'))
      fireEvent.click(screen.getByText('Submit'))

      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      // Should contain original questions array
      expect(call.questions).toEqual(singleQuestion)
      // Plus the answers
      expect(call.answers).toEqual({ Library: 'React' })
    })
  })

  describe('state keyed by index (not header)', () => {
    it('handles duplicate headers correctly', () => {
      const duplicateHeaders = [
        {
          question: 'First question?',
          header: 'Choice',
          options: [{ label: 'A' }, { label: 'B' }],
          multiSelect: false,
        },
        {
          question: 'Second question?',
          header: 'Choice',
          options: [{ label: 'X' }, { label: 'Y' }],
          multiSelect: false,
        },
      ]

      render(
        <AskUserDialog permission={makePermission(duplicateHeaders)} onRespond={onRespond} onDeny={onDeny} />
      )

      // Select options for both questions
      fireEvent.click(screen.getByText('A'))
      fireEvent.click(screen.getByText('X'))
      fireEvent.click(screen.getByText('Submit'))

      // With header-keyed state, the second answer would overwrite the first.
      // With index-keyed state, both can be selected independently.
      // The output payload is still keyed by header, so the last wins.
      expect(onRespond).toHaveBeenCalledOnce()
      const call = onRespond.mock.calls[0]![0] as Record<string, unknown>
      // The second answer (X) wins for the duplicate header key
      expect(call.answers).toEqual({ Choice: 'X' })
    })
  })
})
