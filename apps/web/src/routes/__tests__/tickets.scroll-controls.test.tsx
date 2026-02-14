import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  mockScrollState,
  mockScrollToTop,
  mockScrollToBottom,
  mockMarkViewed,
  mockUploadAsync,
  mockCreateComment,
  mockUpdateComment,
  mockDeleteComment,
  mockSend,
  mockSetCurrentTicket,
  mockSetView,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockScrollState: { isAtTop: false, isAtBottom: false },
  mockScrollToTop: vi.fn(),
  mockScrollToBottom: vi.fn(),
  mockMarkViewed: vi.fn(),
  mockUploadAsync: vi.fn(async () => ({})),
  mockCreateComment: vi.fn(async () => ({ id: 99 })),
  mockUpdateComment: vi.fn(async () => ({})),
  mockDeleteComment: vi.fn(async () => ({})),
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
}))

vi.mock('@kombuse/ui/components', () => ({
  TicketList: () => <div data-testid="ticket-list" />,
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
    data: id > 0 ? { id, title: `Ticket ${id}`, status: 'open' } : undefined,
    isLoading: false,
  }),
  useCreateTicket: () => ({
    mutate: vi.fn(),
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
    data: {
      total: 0,
      items: [],
    },
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
  useScrollToComment: () => ({
    highlightedCommentId: null,
    isScrollToCommentPending: false,
  }),
}))

import { Tickets } from '../tickets'

function renderTicketsRoute() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/tickets/42']}>
      <Routes>
        <Route path="/projects/:projectId/tickets/:ticketId" element={<Tickets />} />
      </Routes>
    </MemoryRouter>
  )
}

function setScrollState(isAtTop: boolean, isAtBottom: boolean) {
  mockScrollState.isAtTop = isAtTop
  mockScrollState.isAtBottom = isAtBottom
}

beforeEach(() => {
  setScrollState(false, false)
  mockScrollToTop.mockReset()
  mockScrollToBottom.mockReset()
  mockMarkViewed.mockReset()
  mockUploadAsync.mockReset()
  mockCreateComment.mockReset()
  mockUpdateComment.mockReset()
  mockDeleteComment.mockReset()
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

    expect(viewport.contains(controls)).toBe(true)
    expect(composerShell.contains(controls)).toBe(false)
    expect(controls.className).toContain('pointer-events-none')
    expect(getByRole('button', { name: 'Scroll to top' }).className).toContain('pointer-events-auto')
    expect(getByRole('button', { name: 'Scroll to bottom' }).className).toContain('pointer-events-auto')

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
})
