import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const {
  mockUseTickets,
  mockSetCurrentTicket,
  mockSetView,
  mockMarkViewed,
  mockCreateTicketMutate,
  mockCreateComment,
  mockUpdateComment,
  mockDeleteComment,
  mockSend,
} = vi.hoisted(() => ({
  mockUseTickets: vi.fn(),
  mockSetCurrentTicket: vi.fn(),
  mockSetView: vi.fn(),
  mockMarkViewed: vi.fn(),
  mockCreateTicketMutate: vi.fn(),
  mockCreateComment: vi.fn(async () => ({ id: 99 })),
  mockUpdateComment: vi.fn(async () => ({})),
  mockDeleteComment: vi.fn(async () => ({})),
  mockSend: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@kombuse/ui/providers', () => ({
  ChatProvider: ({ children }: { children: any }) => <>{children}</>,
}))

vi.mock('@kombuse/ui/base', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Textarea: (props: any) => <textarea {...props} />,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
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
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  ResizableHandle: () => <div />,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@kombuse/ui/components', () => ({
  TicketList: ({ header }: any) => (
    <div data-testid="ticket-list">
      {header}
    </div>
  ),
  TicketListHeader: ({ title, meta, controls, filters }: any) => (
    <div>
      <div>{title}</div>
      {meta}
      {controls}
      {filters}
    </div>
  ),
  TicketDetail: () => <div data-testid="ticket-detail" />,
  ChatInput: () => <div data-testid="chat-input" />,
  ActivityTimeline: () => <div data-testid="timeline" />,
  Chat: () => <div data-testid="chat-view" />,
  LabelBadge: ({ label }: any) => <span>{label.name}</span>,
  MilestoneBadge: ({ milestone }: any) => <span>{milestone.title}</span>,
  StagedFilePreviews: () => null,
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useTickets: (filters: any) => {
    mockUseTickets(filters)
    return {
      data: [{ id: 42, status: 'open', title: 'Ticket 42' }],
      isLoading: false,
      error: null,
    }
  },
  useTicket: () => ({
    data: undefined,
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
  useProjectLabels: () => ({
    data: [
      { id: 1, name: 'bug', color: '#ff0000', description: null, project_id: '1', created_at: '2026-01-01T00:00:00.000Z', usage_count: 6 },
      { id: 2, name: 'backend', color: '#00ff00', description: null, project_id: '1', created_at: '2026-01-01T00:00:00.000Z', usage_count: 4 },
      { id: 3, name: 'ui', color: '#0000ff', description: null, project_id: '1', created_at: '2026-01-01T00:00:00.000Z', usage_count: 2 },
    ],
  }),
  useProjectMilestones: () => ({ data: [] }),
  useTicketTimeline: () => ({ data: { total: 0, items: [] }, isFetched: true }),
  useWebSocket: () => ({ send: mockSend }),
  useCommentsAttachments: () => ({}),
  useUploadAttachment: () => ({ mutateAsync: vi.fn(async () => ({})) }),
  useUploadTicketAttachment: () => ({ mutateAsync: vi.fn(async () => ({})) }),
  useTextareaAutocomplete: () => ({
    textareaProps: { onChange: vi.fn(), onKeyDown: vi.fn() },
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
    isAtTop: true,
    isAtBottom: true,
    scrollToBottom: vi.fn(),
    scrollToTop: vi.fn(),
    onScroll: vi.fn(),
  }),
  useScrollToComment: () => ({
    highlightedCommentId: null,
    isScrollToCommentPending: false,
  }),
}))

import { Tickets } from '../tickets'

function LocationProbe({ onChange }: { onChange: (location: string) => void }) {
  const location = useLocation()

  useEffect(() => {
    onChange(`${location.pathname}${location.search}`)
  }, [location.pathname, location.search, onChange])

  return null
}

function renderTicketsRoute(initialEntry: string, onLocationChange: (location: string) => void) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:projectId/tickets"
          element={
            <>
              <LocationProbe onChange={onLocationChange} />
              <Tickets />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function getLastFilteredTicketQuery() {
  const calls = mockUseTickets.mock.calls
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const filters = calls[index]?.[0]
    if (filters && Object.prototype.hasOwnProperty.call(filters, 'viewer_id')) {
      return filters
    }
  }
  return null
}

beforeEach(() => {
  mockUseTickets.mockReset()
  mockSetCurrentTicket.mockReset()
  mockSetView.mockReset()
  mockMarkViewed.mockReset()
  mockCreateTicketMutate.mockReset()
  mockCreateComment.mockReset()
  mockUpdateComment.mockReset()
  mockDeleteComment.mockReset()
  mockSend.mockReset()
})

describe('Tickets label filters', () => {
  it('rehydrates label ID selections from URL and passes IDs to ticket query filters', () => {
    const locations: string[] = []
    renderTicketsRoute('/projects/1/tickets?labels=2,1', (location) => locations.push(location))

    expect(locations[locations.length - 1]).toBe('/projects/1/tickets?labels=2,1')
    expect(getLastFilteredTicketQuery()?.label_ids).toEqual([2, 1])
  })

  it('updates URL and query filters when toggling labels in overflow multi-select', async () => {
    const locations: string[] = []
    const view = renderTicketsRoute('/projects/1/tickets', (location) => locations.push(location))

    fireEvent.click(view.getByRole('button', { name: /bug/i }))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets?labels=1')
      expect(getLastFilteredTicketQuery()?.label_ids).toEqual([1])
    })

    fireEvent.click(view.getByRole('button', { name: /backend/i }))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets?labels=1%2C2')
      expect(getLastFilteredTicketQuery()?.label_ids).toEqual([1, 2])
    })
  })

  it('clears label selection from UI and URL when pressing clear', async () => {
    const locations: string[] = []
    const view = renderTicketsRoute('/projects/1/tickets?labels=1,2', (location) => locations.push(location))

    fireEvent.click(view.getByRole('button', { name: 'Clear' }))

    await waitFor(() => {
      expect(locations[locations.length - 1]).toBe('/projects/1/tickets')
      expect(getLastFilteredTicketQuery()?.label_ids).toBeUndefined()
    })
  })
})
