import { describe, it, expect } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { PromptEditor } from '../prompt-editor'
import type { TemplateVariableGroup } from '../template-variables'

interface ControlledPromptEditorProps {
  initialValue?: string
  availableVariables?: TemplateVariableGroup[]
}

function ControlledPromptEditor({
  initialValue = '',
  availableVariables,
}: ControlledPromptEditorProps) {
  const [value, setValue] = useState(initialValue)

  return (
    <PromptEditor
      value={value}
      onChange={setValue}
      showAvailableVariables
      availableVariables={availableVariables}
    />
  )
}

describe('PromptEditor', () => {
  it('shows description and availability in tooltip content on hover', async () => {
    const { getByRole } = render(<ControlledPromptEditor />)

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))

    const variableButton = getByRole('button', { name: '{{ event_type }}' })
    expect(variableButton.getAttribute('title')).toBeNull()

    fireEvent.pointerMove(variableButton)

    await waitFor(() => {
      expect(getByRole('tooltip').textContent).toContain('Description')
    })

    const tooltipText = getByRole('tooltip').textContent ?? ''
    expect(tooltipText).toContain('Event type, e.g. "ticket.created"')
    expect(tooltipText).toContain('Available when')
    expect(tooltipText).toContain('Always available.')
  })

  it('shows fallback availability text for custom variables without availability metadata', async () => {
    const customGroups: TemplateVariableGroup[] = [
      {
        label: 'Custom',
        variables: [{ name: 'custom.value', description: 'Custom value from caller context' }],
      },
    ]

    const { getByRole } = render(
      <ControlledPromptEditor availableVariables={customGroups} />
    )

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))

    const variableButton = getByRole('button', { name: '{{ custom.value }}' })
    fireEvent.focus(variableButton)

    await waitFor(() => {
      expect(getByRole('tooltip').textContent).toContain(
        'Availability details are not defined for this variable.'
      )
    })
  })

  it('inserts a variable at the cursor and keeps used-variable highlighting', async () => {
    const { getByPlaceholderText, getByRole } = render(
      <ControlledPromptEditor initialValue="Hello " />
    )

    const textarea = getByPlaceholderText("Enter your system prompt...") as HTMLTextAreaElement
    fireEvent.focus(textarea)
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))
    fireEvent.click(getByRole('button', { name: '{{ ticket.title }}' }))

    await waitFor(() => {
      expect(textarea.value).toBe('Hello {{ ticket.title }}')
    })

    const usedVariableButton = getByRole('button', { name: '{{ ticket.title }}' })
    expect(usedVariableButton.className).toContain('text-primary')
  })
})
