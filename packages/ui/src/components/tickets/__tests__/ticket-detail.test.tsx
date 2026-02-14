import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { Ticket } from '@kombuse/types'
import { TicketDetail } from '../ticket-detail'

let currentTicket: Ticket | null = null
const deleteCurrentTicket = vi.fn()
const updateCurrentTicket = vi.fn().mockResolvedValue(undefined)
const uploadTicketAttachmentMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../hooks', () => ({
  useTicketOperations: () => ({
    currentTicket,
    deleteCurrentTicket,
    updateCurrentTicket,
    isDeleting: false,
    isUpdating: false,
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
  useUploadTicketAttachment: () => ({
    mutateAsync: uploadTicketAttachmentMutateAsync,
  }),
}))

vi.mock('../../../hooks/use-textarea-autocomplete', () => ({
  useTextareaAutocomplete: () => ({
    textareaProps: {
      onChange: () => undefined,
      onKeyDown: () => undefined,
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
    removeFile: () => undefined,
    clearFiles: () => undefined,
    dragHandlers: {},
    handlePaste: () => undefined,
    fileInputRef: { current: null },
    handleFileInputChange: () => undefined,
  }),
}))

vi.mock('../../status-indicator', () => ({
  StatusIndicator: () => <span data-testid="status-indicator" />,
}))

vi.mock('../../labels/label-badge', () => ({
  LabelBadge: () => null,
}))

vi.mock('../../labels/label-selector', () => ({
  LabelSelector: () => null,
}))

vi.mock('../../milestones/milestone-badge', () => ({
  MilestoneBadge: () => null,
}))

vi.mock('../../milestones/milestone-selector', () => ({
  MilestoneSelector: () => null,
}))

vi.mock('../../markdown', () => ({
  Markdown: ({ children }: { children: string }) => <>{children}</>,
}))

vi.mock('../../image-lightbox', () => ({
  ImageLightbox: () => null,
}))

vi.mock('../../staged-file-previews', () => ({
  StagedFilePreviews: () => null,
}))

function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 317,
    project_id: '1',
    author_id: 'user-1',
    assignee_id: null,
    claimed_by_id: null,
    title: 'Display ticket priority in ticket details',
    body: 'Ticket body',
    triggers_enabled: true,
    status: 'open',
    priority: 2,
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
    ...overrides,
  }
}

function enterEditMode(container: HTMLElement) {
  const editIcon = container.querySelector('svg.lucide-pencil')
  const editButton = editIcon?.closest('button')

  if (!(editButton instanceof HTMLButtonElement)) {
    throw new Error('Edit button not found')
  }

  fireEvent.click(editButton)
}

describe('TicketDetail priority display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentTicket = buildTicket()
  })

  it('shows fallback text when priority is null', () => {
    currentTicket = buildTicket({ priority: null })
    const { getByText } = render(<TicketDetail />)

    expect(getByText('Priority: No priority')).toBeDefined()
  })

  it('shows Lowest when priority is 0', () => {
    currentTicket = buildTicket({ priority: 0 })
    const { getByText } = render(<TicketDetail />)

    expect(getByText('Priority: Lowest')).toBeDefined()
  })

  it('shows Highest when priority is 4', () => {
    currentTicket = buildTicket({ priority: 4 })
    const { getByText } = render(<TicketDetail />)

    expect(getByText('Priority: Highest')).toBeDefined()
  })

  it('shows priority in edit mode', () => {
    currentTicket = buildTicket({ priority: null })
    const { container, getByText } = render(<TicketDetail isEditable />)

    enterEditMode(container)

    expect(getByText('Priority: No priority')).toBeDefined()
  })
})
