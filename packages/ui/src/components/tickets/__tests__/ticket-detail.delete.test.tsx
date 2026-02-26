import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { TicketDetail } from '../ticket-detail'

const testState = vi.hoisted(() => ({
  currentTicket: {
    id: 352,
    ticket_number: 1,
    project_id: '1',
    author_id: 'user-1',
    assignee_id: null,
    claimed_by_id: null,
    title: 'Delete dialog test ticket',
    body: 'Body',
    triggers_enabled: true,
    loop_protection_enabled: true,
    status: 'open',
    priority: null,
    external_source: null,
    external_id: null,
    milestone_id: null,
    external_url: null,
    synced_at: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    opened_at: '2026-02-14T00:00:00.000Z',
    closed_at: null,
    last_activity_at: '2026-02-14T00:00:00.000Z',
    author: {
      id: 'user-1',
      type: 'user',
      name: 'User One',
      email: null,
      description: null,
      avatar_url: null,
      external_source: null,
      external_id: null,
      is_active: true,
      created_at: '2026-02-14T00:00:00.000Z',
      updated_at: '2026-02-14T00:00:00.000Z',
    },
    assignee: null,
    labels: [],
  },
  isDeleting: false,
  isUpdating: false,
  deleteCurrentTicket: vi.fn(),
  updateCurrentTicket: vi.fn(),
}))

vi.mock('../../../hooks', () => ({
  useTicketOperations: () => ({
    currentTicket: testState.currentTicket,
    deleteCurrentTicket: testState.deleteCurrentTicket,
    updateCurrentTicket: testState.updateCurrentTicket,
    isDeleting: testState.isDeleting,
    isUpdating: testState.isUpdating,
  }),
  useLabelOperations: () => ({
    ticketLabels: [],
    projectLabels: [],
    addLabel: vi.fn(),
    removeLabel: vi.fn(),
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  }),
  useMilestoneOperations: () => ({
    projectMilestones: [],
    currentMilestone: null,
    createMilestone: vi.fn(),
    isCreating: false,
  }),
  useTicketAgentStatus: () => 'idle',
  useCurrentProject: () => ({ currentProjectId: '1' }),
  useTicketAttachments: () => ({ data: [] }),
  useUploadTicketAttachment: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../../hooks/use-app-context', () => ({
  useSmartLabels: () => ({
    smartLabelIds: new Set<number>(),
    isSmartLabel: () => false,
  }),
}))

vi.mock('../../../hooks/use-textarea-autocomplete', () => ({
  useTextareaAutocomplete: () => ({
    textareaProps: {
      onChange: vi.fn(),
      onKeyDown: vi.fn(),
    },
    AutocompletePortal: () => null,
  }),
}))

vi.mock('../../../hooks/use-file-staging', () => ({
  useFileStaging: () => ({
    stagedFiles: [],
    previewUrls: [],
    isDragOver: false,
    hasFiles: false,
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    dragHandlers: {},
    handlePaste: vi.fn(),
    fileInputRef: { current: null },
    handleFileInputChange: vi.fn(),
  }),
}))

describe('TicketDetail delete dialog', () => {
  beforeEach(() => {
    testState.deleteCurrentTicket.mockReset()
    testState.updateCurrentTicket.mockReset()
    testState.isDeleting = false
    testState.isUpdating = false
  })

  it('opens a warning dialog instead of deleting immediately', () => {
    const { getByRole, getByText } = render(<TicketDetail isEditable />)

    fireEvent.click(getByRole('button', { name: 'Delete ticket' }))

    expect(getByText('Delete ticket?')).toBeTruthy()
    expect(testState.deleteCurrentTicket).not.toHaveBeenCalled()
  })

  it('does not delete when canceling or dismissing the dialog', () => {
    const { getByRole, queryByText } = render(<TicketDetail isEditable />)

    fireEvent.click(getByRole('button', { name: 'Delete ticket' }))
    fireEvent.click(getByRole('button', { name: 'Cancel' }))
    expect(queryByText('Delete ticket?')).toBeNull()
    expect(testState.deleteCurrentTicket).not.toHaveBeenCalled()

    fireEvent.click(getByRole('button', { name: 'Delete ticket' }))
    fireEvent.click(getByRole('button', { name: 'Close' }))
    expect(queryByText('Delete ticket?')).toBeNull()
    expect(testState.deleteCurrentTicket).not.toHaveBeenCalled()
  })

  it('deletes once on confirm and calls onClose after successful deletion', async () => {
    const onClose = vi.fn()
    let releaseDelete: () => void = () => undefined

    testState.deleteCurrentTicket.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseDelete = () => resolve()
        })
    )

    const { getByRole } = render(<TicketDetail isEditable onClose={onClose} />)

    fireEvent.click(getByRole('button', { name: 'Delete ticket' }))
    fireEvent.click(getByRole('button', { name: 'Delete' }))

    expect(testState.deleteCurrentTicket).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    releaseDelete()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows a loading label and disables destructive action while deleting', () => {
    const { getByRole, rerender } = render(<TicketDetail isEditable />)

    fireEvent.click(getByRole('button', { name: 'Delete ticket' }))

    testState.isDeleting = true
    rerender(<TicketDetail isEditable />)

    const deletingButton = getByRole('button', { name: 'Deleting...' })
    expect(deletingButton.hasAttribute('disabled')).toBe(true)
  })
})
