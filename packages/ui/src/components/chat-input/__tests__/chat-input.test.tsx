import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { ChatInput } from '../chat-input'

let mockHasFiles = false
const mockClearFiles = vi.fn()
const mockOnKeyDown = vi.fn()
const mockFileInputRef = { current: null as HTMLInputElement | null }

vi.mock('@/hooks/use-file-staging', () => ({
  useFileStaging: () => ({
    stagedFiles: [],
    previewUrls: [],
    isDragOver: false,
    hasFiles: mockHasFiles,
    removeFile: vi.fn(),
    clearFiles: mockClearFiles,
    dragHandlers: {},
    handlePaste: vi.fn(),
    fileInputRef: mockFileInputRef,
    handleFileInputChange: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-textarea-autocomplete', () => ({
  useTextareaAutocomplete: ({ onValueChange }: { onValueChange: (value: string) => void }) => ({
    textareaProps: {
      onChange: (event: { target: { value: string } }) => onValueChange(event.target.value),
      onKeyDown: mockOnKeyDown,
    },
    AutocompletePortal: () => null,
  }),
}))

describe('ChatInput', () => {
  beforeEach(() => {
    mockHasFiles = false
    mockClearFiles.mockReset()
    mockOnKeyDown.mockReset()
  })

  it('renders custom toolbar controls inside the composer', () => {
    const { getByText, getByRole } = render(
      <ChatInput onSubmit={vi.fn()} toolbarControls={<button type="button">Agent</button>} />
    )

    expect(getByText('Agent')).toBeDefined()
    expect(getByRole('button', { name: 'Attach file' })).toBeDefined()
    expect(getByRole('button', { name: 'Send message' })).toBeDefined()
  })

  it('submits trimmed text and clears staged files after submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { getByPlaceholderText, getByRole } = render(<ChatInput onSubmit={onSubmit} />)

    const textarea = getByPlaceholderText('Type a message...')
    fireEvent.change(textarea, { target: { value: '  hello world  ' } })
    fireEvent.click(getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('hello world', undefined)
    })
    expect(mockClearFiles).toHaveBeenCalledOnce()
  })

  it('shows stop button when loading and onStop is provided', () => {
    const onStop = vi.fn()
    const { getByRole, queryByRole } = render(
      <ChatInput onSubmit={vi.fn()} isLoading onStop={onStop} />
    )

    const stopButton = getByRole('button', { name: 'Stop agent' })
    fireEvent.click(stopButton)

    expect(onStop).toHaveBeenCalledOnce()
    expect(queryByRole('button', { name: 'Send message' })).toBeNull()
  })
})
