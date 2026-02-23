import { describe, it, expect } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { PromptEditor } from '../prompt-editor'
import type { TemplateVariableGroup } from '../template-variables'
import { TEMPLATE_ENGINE_NOTE } from '../template-snippets'

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
  it('shows engine note and basic templating snippets in the helper panel', () => {
    const { getByRole, getByText } = render(<ControlledPromptEditor />)

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))

    expect(getByText(TEMPLATE_ENGINE_NOTE)).toBeTruthy()
    expect(getByRole('button', { name: 'if / else' })).toBeTruthy()
    expect(getByRole('button', { name: 'for' })).toBeTruthy()
    expect(getByRole('button', { name: 'comment' })).toBeTruthy()
  })

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

  it('inserts snippets verbatim without wrapping them in interpolation braces', async () => {
    const { getByPlaceholderText, getByRole } = render(
      <ControlledPromptEditor initialValue="Start " />
    )

    const textarea = getByPlaceholderText("Enter your system prompt...") as HTMLTextAreaElement
    fireEvent.focus(textarea)
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))
    fireEvent.click(getByRole('button', { name: 'if / else' }))

    await waitFor(() => {
      expect(textarea.value).toBe(`Start {% if condition %}
...
{% else %}
...
{% endif %}`)
    })

    expect(textarea.value).not.toContain('{{')
  })

  it('disables snippet and variable insertion in preview mode', () => {
    const { getByRole } = render(<ControlledPromptEditor />)

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))
    fireEvent.click(getByRole('button', { name: 'Preview' }))

    const variableButton = getByRole('button', { name: '{{ event_type }}' })
    const snippetButton = getByRole('button', { name: 'if / else' })

    expect(variableButton.hasAttribute('disabled')).toBe(true)
    expect(snippetButton.hasAttribute('disabled')).toBe(true)
  })

  it('disables snippet and variable insertion when the editor is disabled', () => {
    const { getByRole } = render(
      <PromptEditor value="" onChange={() => undefined} showAvailableVariables disabled />
    )

    fireEvent.click(getByRole('button', { name: 'Available Variables' }))

    const variableButton = getByRole('button', { name: '{{ event_type }}' })
    const snippetButton = getByRole('button', { name: 'if / else' })

    expect(variableButton.hasAttribute('disabled')).toBe(true)
    expect(snippetButton.hasAttribute('disabled')).toBe(true)
  })

  it('preserves fixed min/max height defaults when fillHeight is not enabled', () => {
    const { getByPlaceholderText } = render(
      <PromptEditor value="" onChange={() => undefined} />
    )

    const textarea = getByPlaceholderText("Enter your system prompt...") as HTMLTextAreaElement

    expect(textarea.style.minHeight).toBe('200px')
    expect(textarea.style.maxHeight).toBe('')
    expect(textarea.className).not.toContain('flex-1')
  })

  it('uses fill-height classes in edit mode and keeps prompt controls available', () => {
    const { container, getByPlaceholderText, getByRole } = render(
      <PromptEditor value="" onChange={() => undefined} fillHeight />
    )

    const root = container.firstElementChild as HTMLElement
    const textarea = getByPlaceholderText("Enter your system prompt...") as HTMLTextAreaElement

    expect(root.className).toContain('h-full')
    expect(root.className).toContain('min-h-0')
    expect(textarea.className).toContain('flex-1')
    expect(textarea.className).toContain('min-h-0')
    expect(textarea.style.minHeight).toBe('')
    expect(textarea.style.maxHeight).toBe('')
    expect(getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('uses fill-height classes in preview mode with internal vertical overflow', () => {
    const { getByRole, getByText } = render(
      <PromptEditor
        value="Hello {{ user.name }}"
        onChange={() => undefined}
        fillHeight
      />
    )

    fireEvent.click(getByRole('button', { name: 'Preview' }))

    const previewVariable = getByText('{{user.name}}')
    const previewContainer = previewVariable.parentElement as HTMLElement

    expect(previewContainer.className).toContain('flex-1')
    expect(previewContainer.className).toContain('min-h-0')
    expect(previewContainer.className).toContain('overflow-y-auto')
    expect(previewContainer.style.minHeight).toBe('')
    expect(previewContainer.style.maxHeight).toBe('')
  })
})
