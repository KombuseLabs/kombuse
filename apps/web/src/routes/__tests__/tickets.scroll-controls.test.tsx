import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const {
  mockScrollState,
  mockScrollToTop,
  mockScrollToBottom,
  mockSelectedTicket,
  mockTimelineState,
  mockUseScrollToComment,
  mockMarkViewed,
  mockUploadAsync,
  mockCreateTicketMutate,
  mockCreateComment,
  mockUpdateComment,
  mockDeleteComment,
  mockTicketListProps,
  mockSend,
  mockSetCurrentTicket,
  mockSetView,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockScrollState: { isAtTop: false, isAtBottom: false },
  mockScrollToTop: vi.fn(),
  mockScrollToBottom: vi.fn(),
  mockSelectedTicket: {
    value: { id: 42, title: 'Ticket 42', status: 'open' },
  },
  mockTimelineState: {
    data: {
      total: 0,
      items: [],
    },
    isFetched: true,
  },
  mockUseScrollToComment: vi.fn(() => ({
    highlightedCommentId: null,
    isScrollToCommentPending: false,
  })),
  mockMarkViewed: vi.fn(),
  mockUploadAsync: vi.fn(async () => ({})),
  mockCreateTicketMutate: vi.fn(),
  mockCreateComment: vi.fn(async () => ({ id: 99 })),
  mockUpdateComment: vi.fn(async () => ({})),
  mockDeleteComment: vi.fn(async () => ({})),
  mockTicketListProps: vi.fn(),
  mockSend: vi.fn(),
  mockSetCurrentTicket: vi.fn(),
  mockSetView: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock('@kombuse/ui/providers', () => ({
  ChatProvider: ({ children }: { children: any }) => <>{children}</>,
}))

vi.mock('@kombuse/ui/base', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Textarea: (props: any) => <textarea {...props} />,
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
  Input: (props: any) => <input {...props} />,
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  ResizablePanel: ({ children, id, className }: any) => (
    <div data-testid={`panel-${id}`} className={className}>
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
  ResizableCardPanel: ({ children }: any) => <div>{children}</div>,
  ResizableCardHandle: () => <div data-testid="resizable-card-handle" />,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@kombuse/ui/components', () => ({
  TicketList: (props: any) => {
    mockTicketListProps(props)

    return (
      <div data-testid="ticket-list">
        {props.header}
        <button type="button" onClick={() => props.onTicketClick?.({ id: 43 })}>
          Open Ticket 43
        </button>
      </div>
    )
  },
  TicketListHeader: ({ title, meta, controls, filters }: any) => (
    <div>
      {title}
      {meta}
      {controls}
      {filters}
    </div>
  ),
  TicketDetail: () => <div data-testid="ticket-detail" />,
  ChatInput: () => (
    <div data-testid="ticket-chat-input">
      <textarea aria-label="Ticket composer input" />
      <button type="button" aria-label="Ticket composer send">
        Send
      </button>
    </div>
  ),
  ActivityTimeline: () => <div data-testid="activity-timeline" />,
  Chat: () => <div data-testid="chat-view" />,
  LabelBadge: ({ label }: any) => <span>{label.name}</span>,
  MilestoneBadge: ({ milestone }: any) => <span>{milestone.title ?? milestone.name ?? 'Milestone'}</span>,
  StagedFilePreviews: () => <div data-testid="staged-file-previews" />,
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useTickets: () => ({
    data: [{ id: 42, status: 'open', title: 'Ticket 42' }],
    isLoading: false,
    error: null,
  }),
  useTicket: (id: number) => ({
    data: id > 0 ? mockSelectedTicket.value : undefined,
    isLoading: false,
  }),
  useCreateTicket: () => ({
    mutate: mockCreateTicketMutate,
    isPending: false,
  }),
  useAppContext: () => ({
    setCurrentTicket: mockSetCurrentTicket,
    setView: mockSetView,
  }),
  useCommentOperations: () => ({
    createComment: mockCreateComment,
    updateComment: mockUpdateComment,
    deleteComment: mockDeleteComment,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  }),
  useRealtimeUpdates: () => undefined,
  useProjectLabels: () => ({ data: [] }),
  useProjectMilestones: () => ({ data: [] }),
  useTicketTimeline: () => ({
    data: mockTimelineState.data,
    isFetched: mockTimelineState.isFetched,
  }),
  useWebSocket: () => ({ send: mockSend }),
  useCommentsAttachments: () => ({}),
  useUploadAttachment: () => ({ mutateAsync: mockUploadAsync }),
  useUploadTicketAttachment: () => ({ mutateAsync: mockUploadAsync }),
  useTextareaAutocomplete: () => ({
    textareaProps: {
      onChange: vi.fn(),
      onKeyDown: vi.fn(),
    },
    AutocompletePortal: () => null,
  }),
  useMarkTicketViewed: () => ({ mutate: mockMarkViewed }),
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
  useScrollToBottom: () => ({
    scrollRef: { current: null },
    isAtTop: mockScrollState.isAtTop,
    isAtBottom: mockScrollState.isAtBottom,
    scrollToBottom: mockScrollToBottom,
    scrollToTop: mockScrollToTop,
    onScroll: vi.fn(),
  }),
  useScrollToComment: mockUseScrollToComment,
}))

import { Tickets } from '../tickets'

function LocationProbe({ onChange }: { onChange: (location: string) => void }) {
  const location = useLocation()

  useEffect(() => {
    onChange(`${location.pathname}${location.search}`)
  }, [location.pathname, location.search, onChange])

  return null
}

function ticketsRouteElement(
  initialEntry = '/projects/1/tickets/42',
  onLocationChange?: (location: string) => void
) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:projectId/tickets/:ticketNumber"
          element={
            <>
              {onLocationChange ? <LocationProbe onChange={onLocationChange} /> : null}
              <Tickets />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

function renderTicketsRoute(
  initialEntry = '/projects/1/tickets/42',
  onLocationChange?: (location: string) => void
) {
  return render(ticketsRouteElement(initialEntry, onLocationChange))
}

function setScrollState(isAtTop: boolean, isAtBottom: boolean) {
  mockScrollState.isAtTop = isAtTop
  mockScrollState.isAtBottom = isAtBottom
}

function getLastTicketListProps() {
  const calls = mockTicketListProps.mock.calls
  return calls.length > 0 ? calls[calls.length - 1][0] : undefined
}

beforeEach(() => {
  setScrollState(false, false)
  mockSelectedTicket.value = { id: 42, title: 'Ticket 42', status: 'open' }
  mockTimelineState.data = { total: 0, items: [] }
  mockTimelineState.isFetched = true
  mockUseScrollToComment.mockClear()
  mockUseScrollToComment.mockImplementation(() => ({
    highlightedCommentId: null,
    isScrollToCommentPending: false,
  }))
  mockScrollToTop.mockReset()
  mockScrollToBottom.mockReset()
  mockCreateTicketMutate.mockReset()
  mockCreateTicketMutate.mockImplementation((_input, options) => {
    options?.onSuccess?.({ id: 99 })
  })
  mockMarkViewed.mockReset()
  mockUploadAsync.mockReset()
  mockCreateComment.mockReset()
  mockUpdateComment.mockReset()
  mockDeleteComment.mockReset()
  mockTicketListProps.mockReset()
  mockSend.mockReset()
  mockSetCurrentTicket.mockReset()
  mockSetView.mockReset()
  mockInvalidateQueries.mockReset()
})

describe('Tickets scroll controls', () => {
  it('scopes floating controls to the scroll viewport and keeps composer interactive', () => {
    const { getByLabelText, getByRole, getByTestId } = renderTicketsRoute()

    const viewport = getByTestId('ticket-scroll-viewport')
    const controls = getByTestId('ticket-scroll-controls')
    const composerShell = getByTestId('ticket-composer-shell')
    const scrollContainer = viewport.querySelector('.ticket-detail-scroll')
    const topButton = getByRole('button', { name: 'Scroll to top' })
    const bottomButton = getByRole('button', { name: 'Scroll to bottom' })

    expect(viewport.contains(controls)).toBe(true)
    expect(composerShell.contains(controls)).toBe(false)
    expect(viewport.className).toContain('ticket-scroll-viewport')
    expect(scrollContainer).not.toBeNull()
    expect(controls.className).toContain('pointer-events-none')
    expect(controls.className).toContain('ticket-scroll-controls')
    expect(topButton.className).toContain('ticket-scroll-control-button')
    expect(bottomButton.className).toContain('ticket-scroll-control-button')
    expect(topButton.className).not.toContain('opacity-80')
    expect(bottomButton.className).not.toContain('opacity-80')

    const composerInput = getByLabelText('Ticket composer input') as HTMLTextAreaElement
    composerInput.focus()
    expect(composerInput.tagName).toBe('TEXTAREA')

    const composerSendButton = getByRole('button', { name: 'Ticket composer send' }) as HTMLButtonElement
    fireEvent.click(composerSendButton)
    expect(composerSendButton.disabled).toBe(false)
  })

  it('preserves top and bottom visibility behavior for controls', () => {
    let view = renderTicketsRoute()
    expect(view.getByRole('button', { name: 'Scroll to top' })).toBeDefined()
    expect(view.getByRole('button', { name: 'Scroll to bottom' })).toBeDefined()
    view.unmount()

    setScrollState(true, false)
    view = renderTicketsRoute()
    expect(view.queryByRole('button', { name: 'Scroll to top' })).toBeNull()
    expect(view.getByRole('button', { name: 'Scroll to bottom' })).toBeDefined()
    view.unmount()

    setScrollState(false, true)
    view = renderTicketsRoute()
    expect(view.getByRole('button', { name: 'Scroll to top' })).toBeDefined()
    expect(view.queryByRole('button', { name: 'Scroll to bottom' })).toBeNull()
    view.unmount()

    setScrollState(true, true)
    view = renderTicketsRoute()
    expect(view.queryByTestId('ticket-scroll-controls')).toBeNull()
    expect(view.queryByRole('button', { name: 'Scroll to top' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Scroll to bottom' })).toBeNull()
  })

  it('keeps top and bottom scroll action handlers wired', () => {
    const { getByRole } = renderTicketsRoute()

    fireEvent.click(getByRole('button', { name: 'Scroll to top' }))
    fireEvent.click(getByRole('button', { name: 'Scroll to bottom' }))

    expect(mockScrollToTop).toHaveBeenCalledOnce()
    expect(mockScrollToBottom).toHaveBeenCalledOnce()
  })

  it('treats a fetched empty timeline as loaded for hash navigation', () => {
    mockTimelineState.data = { total: 0, items: [] }
    mockTimelineState.isFetched = true

    renderTicketsRoute()

    expect(mockUseScrollToComment).toHaveBeenLastCalledWith({ isTimelineLoaded: true })
  })

  it('waits for ticket detail mount before enabling hash navigation', () => {
    mockTimelineState.data = { total: 1, items: [{ type: 'comment', data: { id: 144 } }] }
    mockTimelineState.isFetched = true
    mockSelectedTicket.value = undefined

    const view = renderTicketsRoute()

    expect(mockUseScrollToComment).toHaveBeenLastCalledWith({ isTimelineLoaded: false })

    mockSelectedTicket.value = { id: 42, title: 'Ticket 42', status: 'open' }
    view.rerender(ticketsRouteElement())

    expect(mockUseScrollToComment).toHaveBeenLastCalledWith({ isTimelineLoaded: true })
  })

  it('preserves session query on deep link and renders the chat panel', async () => {
    const locations: string[] = []

    const { getByTestId } = renderTicketsRoute(
      '/projects/1/tickets/42?session=trigger-session-1',
      (location) => locations.push(location)
    )

    expect(getByTestId('panel-chat')).toBeDefined()
    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets/42?session=trigger-session-1')
    })
  })

  it('removes only the session query when closing the chat panel', async () => {
    const locations: string[] = []

    const { getByTestId } = renderTicketsRoute(
      '/projects/1/tickets/42?status=open&session=trigger-session-1',
      (location) => locations.push(location)
    )

    const chatPanel = getByTestId('panel-chat')
    fireEvent.click(within(chatPanel).getByRole('button'))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets/42?status=open')
    })
  })

  it('clears session query when navigating to another ticket from the list', async () => {
    const locations: string[] = []

    const { getByRole } = renderTicketsRoute(
      '/projects/1/tickets/42?session=trigger-session-1&status=open',
      (location) => locations.push(location)
    )

    fireEvent.click(getByRole('button', { name: 'Open Ticket 43' }))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets/43?status=open')
    })
  })

  it('strips session query during create flow and after creating a ticket', async () => {
    const locations: string[] = []

    const { getByRole, getAllByRole, getByLabelText } = renderTicketsRoute(
      '/projects/1/tickets/42?session=trigger-session-1&status=open',
      (location) => locations.push(location)
    )

    fireEvent.click(getByRole('button', { name: 'Create Ticket' }))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets/new?status=open')
    })

    fireEvent.change(getByLabelText('Title *'), { target: { value: 'New ticket from create flow' } })

    const createButtons = getAllByRole('button', { name: 'Create Ticket' })
    const activeCreateButton = createButtons.find((button) => !(button as HTMLButtonElement).disabled)
    expect(activeCreateButton).toBeDefined()

    fireEvent.click(activeCreateButton as HTMLButtonElement)

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets/99?status=open')
    })
  })

  it('passes closed_at sortBy to TicketList when the status allows closed sorting', () => {
    renderTicketsRoute('/projects/1/tickets/42?status=closed&sort_by=closed_at')

    expect(getLastTicketListProps()?.sortBy).toBe('closed_at')
  })

  it('falls back to created_at sortBy when closed_at is disallowed by status', () => {
    renderTicketsRoute('/projects/1/tickets/42?status=open&sort_by=closed_at')

    expect(getLastTicketListProps()?.sortBy).toBe('created_at')
  })
})
