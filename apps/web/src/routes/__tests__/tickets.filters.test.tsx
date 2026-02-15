import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

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
  ResizableCardPanel: ({ children }: any) => <div>{children}</div>,
  ResizableCardHandle: () => <div />,
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

function mockLabelFilterMeasurements(config: {
  rowWidth: number
  labelWidths: Record<string, number>
  moreWidth: number
  clearWidth: number
}) {
  const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth() {
    const element = this as HTMLElement
    if (element.getAttribute('data-testid') === 'ticket-label-filters-row') {
      return config.rowWidth
    }
    return 0
  })

  const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidth() {
    const text = ((this as HTMLElement).textContent ?? '').trim()
    if (text === 'More (00)' || /^More \(/.test(text)) {
      return config.moreWidth
    }
    if (text === 'Clear') {
      return config.clearWidth
    }
    return config.labelWidths[text] ?? 0
  })

  return () => {
    clientWidthSpy.mockRestore()
    offsetWidthSpy.mockRestore()
  }
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
  it('shows all labels that fit without rendering an overflow trigger', async () => {
    const restoreMeasurements = mockLabelFilterMeasurements({
      rowWidth: 196,
      labelWidths: {
        bug: 60,
        backend: 60,
        ui: 60,
      },
      moreWidth: 80,
      clearWidth: 40,
    })

    try {
      const view = renderTicketsRoute('/projects/1/tickets', () => {})

      await waitFor(() => {
        const labelsRow = view.getByTestId('ticket-label-filters-row')
        expect(within(labelsRow).queryByRole('button', { name: /More \(/i })).toBeNull()
      })

      const labelsRow = view.getByTestId('ticket-label-filters-row')
      expect(within(labelsRow).getByRole('button', { name: 'bug' })).toBeDefined()
      expect(within(labelsRow).getByRole('button', { name: 'backend' })).toBeDefined()
      expect(within(labelsRow).getByRole('button', { name: 'ui' })).toBeDefined()
    } finally {
      restoreMeasurements()
    }
  })

  it('renders hidden measurement More button as non-focusable with tabIndex -1', () => {
    const view = renderTicketsRoute('/projects/1/tickets', () => {})

    const measureRoot = view.getByTestId('ticket-label-filters-measure')
    expect(measureRoot.getAttribute('aria-hidden')).toBe('true')

    const moreButton = measureRoot.querySelector('button')
    expect(moreButton).not.toBeNull()
    expect(moreButton?.getAttribute('tabindex')).toBe('-1')
  })

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

  it('recovers label visibility when container initially has zero width', async () => {
    let containerWidth = 0
    let rafCallCount = 0

    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth() {
      const element = this as HTMLElement
      if (element.getAttribute('data-testid') === 'ticket-label-filters-row') {
        return containerWidth
      }
      return 0
    })

    const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidth() {
      const text = ((this as HTMLElement).textContent ?? '').trim()
      if (text === 'More (00)' || /^More \(/.test(text)) return 80
      if (text === 'Clear') return 40
      const widths: Record<string, number> = { bug: 60, backend: 60, ui: 60 }
      return widths[text] ?? 0
    })

    const originalRaf = window.requestAnimationFrame
    const originalCaf = window.cancelAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallCount += 1
      if (rafCallCount >= 2) {
        containerWidth = 196
      }
      cb(0)
      return rafCallCount
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    try {
      const view = renderTicketsRoute('/projects/1/tickets', () => {})

      await waitFor(() => {
        const labelsRow = view.getByTestId('ticket-label-filters-row')
        expect(within(labelsRow).getByRole('button', { name: 'bug' })).toBeDefined()
        expect(within(labelsRow).getByRole('button', { name: 'backend' })).toBeDefined()
        expect(within(labelsRow).getByRole('button', { name: 'ui' })).toBeDefined()
      })
    } finally {
      clientWidthSpy.mockRestore()
      offsetWidthSpy.mockRestore()
      vi.stubGlobal('requestAnimationFrame', originalRaf)
      vi.stubGlobal('cancelAnimationFrame', originalCaf)
    }
  })

  it('recalculates label visibility when ticketId changes (layout transition)', async () => {
    let containerWidth = 196

    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth() {
      const element = this as HTMLElement
      if (element.getAttribute('data-testid') === 'ticket-label-filters-row') {
        return containerWidth
      }
      return 0
    })

    const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidth() {
      const text = ((this as HTMLElement).textContent ?? '').trim()
      if (text === 'More (00)' || /^More \(/.test(text)) return 80
      if (text === 'Clear') return 40
      const widths: Record<string, number> = { bug: 60, backend: 60, ui: 60 }
      return widths[text] ?? 0
    })

    const originalRaf = window.requestAnimationFrame
    const originalCaf = window.cancelAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let navigateFn: ReturnType<typeof useNavigate> | undefined

    function NavigateCapture() {
      navigateFn = useNavigate()
      return null
    }

    try {
      const view = render(
        <MemoryRouter initialEntries={['/projects/1/tickets']}>
          <Routes>
            <Route
              path="/projects/:projectId/tickets/:ticketId?"
              element={
                <>
                  <NavigateCapture />
                  <Tickets />
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => {
        const labelsRow = view.getByTestId('ticket-label-filters-row')
        expect(within(labelsRow).getByRole('button', { name: 'bug' })).toBeDefined()
        expect(within(labelsRow).getByRole('button', { name: 'backend' })).toBeDefined()
        expect(within(labelsRow).getByRole('button', { name: 'ui' })).toBeDefined()
        expect(within(labelsRow).queryByRole('button', { name: /More \(/i })).toBeNull()
      })

      containerWidth = 148

      act(() => {
        navigateFn!('/projects/1/tickets/42')
      })

      await waitFor(() => {
        const labelsRow = view.getByTestId('ticket-label-filters-row')
        expect(within(labelsRow).queryByRole('button', { name: /More \(/i })).not.toBeNull()
      })
    } finally {
      clientWidthSpy.mockRestore()
      offsetWidthSpy.mockRestore()
      vi.stubGlobal('requestAnimationFrame', originalRaf)
      vi.stubGlobal('cancelAnimationFrame', originalCaf)
    }
  })
})
