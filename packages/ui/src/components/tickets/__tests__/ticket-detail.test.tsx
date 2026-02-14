import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

function enterEditMode() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit ticket' }))
}

describe('TicketDetail priority display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentTicket = buildTicket()
  })

  it('shows fallback text when priority is null', () => {
    currentTicket = buildTicket({ priority: null })
    render(<TicketDetail />)

    expect(screen.getByText('Priority: No priority')).toBeDefined()
  })

  it('shows Lowest when priority is 0', () => {
    currentTicket = buildTicket({ priority: 0 })
    render(<TicketDetail />)

    expect(screen.getByText('Priority: Lowest')).toBeDefined()
  })

  it('shows Highest when priority is 4', () => {
    currentTicket = buildTicket({ priority: 4 })
    render(<TicketDetail />)

    expect(screen.getByText('Priority: Highest')).toBeDefined()
  })

  it('shows priority in edit mode', () => {
    currentTicket = buildTicket({ priority: null })
    render(<TicketDetail isEditable />)

    enterEditMode()

    expect(screen.getByText('Priority: No priority')).toBeDefined()
  })
})

describe('TicketDetail header behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentTicket = buildTicket()
  })

  it('uses elevated sticky header styling classes', () => {
    const { container } = render(<TicketDetail />)
    const stickyHeader = container.querySelector('div.sticky.top-0.z-20')

    expect(stickyHeader).toBeTruthy()
    expect(stickyHeader?.className.includes('shadow-md')).toBe(true)
    expect(stickyHeader?.className.includes('backdrop-blur-sm')).toBe(true)
  })

  it('renders the title as a semantic h1 with tight leading', () => {
    render(<TicketDetail />)

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Display ticket priority in ticket details',
    })

    expect(heading.tagName).toBe('H1')
    expect(heading.className.includes('leading-tight')).toBe(true)
  })

  it('shows the created date in the secondary row in view and edit modes', () => {
    render(<TicketDetail isEditable />)

    expect(screen.getByText(/^Created /)).toBeDefined()
    enterEditMode()
    expect(screen.getByText(/^Created /)).toBeDefined()
  })

  it('shows trigger toggle only in editable view mode and updates ticket triggers', () => {
    render(<TicketDetail isEditable />)

    const triggerSwitch = screen.getByRole('switch', { name: 'Toggle ticket triggers' })
    expect(triggerSwitch).toBeDefined()

    fireEvent.click(triggerSwitch)
    expect(updateCurrentTicket).toHaveBeenCalledWith({ triggers_enabled: false })

    enterEditMode()
    expect(screen.queryByRole('switch', { name: 'Toggle ticket triggers' })).toBeNull()
  })

  it('renders mode-specific action controls', () => {
    render(<TicketDetail isEditable />)

    expect(screen.getByRole('button', { name: 'Edit ticket' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete ticket' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    enterEditMode()

    expect(screen.getByRole('button', { name: 'Attach files' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Edit ticket' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete ticket' })).toBeNull()
  })
})
