import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TicketFilters, TicketWithLabels } from '@kombuse/types'
import { TicketList } from '../ticket-list'

vi.mock('../../../hooks', () => ({
  useTicketAgentStatus: () => 'idle',
}))

vi.mock('../../status-indicator', () => ({
  StatusIndicator: () => null,
}))

vi.mock('../../labels/label-badge', () => ({
  LabelBadge: ({ label }: { label: { name: string } }) => <span>{label.name}</span>,
}))

type TicketSortBy = NonNullable<TicketFilters['sort_by']>

function buildTicket(overrides: Partial<TicketWithLabels> = {}): TicketWithLabels {
  return {
    id: 317,
    ticket_number: 1,
    project_id: '1',
    author_id: 'user-1',
    assignee_id: null,
    claimed_by_id: null,
    title: 'Render date by active sort mode',
    body: 'Ticket body',
    triggers_enabled: true,
    loop_protection_enabled: true,
    status: 'open',
    priority: 2,
    external_source: null,
    external_id: null,
    milestone_id: null,
    external_url: null,
    synced_at: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-02T00:00:00.000Z',
    opened_at: '2026-02-03T00:00:00.000Z',
    closed_at: '2026-02-05T00:00:00.000Z',
    last_activity_at: '2026-02-04T00:00:00.000Z',
    labels: [],
    ...overrides,
  }
}

const sortDateLabelPrefixes: Record<TicketSortBy, string> = {
  created_at: 'Created',
  updated_at: 'Updated',
  opened_at: 'Opened',
  last_activity_at: 'Activity',
  closed_at: 'Closed',
}

function formatDateLabel(date: string, sortBy: TicketSortBy) {
  const formatted = new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${sortDateLabelPrefixes[sortBy]}: ${formatted}`
}

const sortFieldCases: Array<[
  TicketSortBy,
  'created_at' | 'updated_at' | 'opened_at' | 'last_activity_at' | 'closed_at',
]> = [
  ['created_at', 'created_at'],
  ['updated_at', 'updated_at'],
  ['opened_at', 'opened_at'],
  ['last_activity_at', 'last_activity_at'],
  ['closed_at', 'closed_at'],
]

describe('TicketList date display', () => {
  it.each(sortFieldCases)('renders %s from ticket.%s', (sortBy, field) => {
    const ticket = buildTicket()
    const expectedDate = formatDateLabel(ticket[field] as string, sortBy)

    render(<TicketList tickets={[ticket]} sortBy={sortBy} />)

    expect(screen.getByText(expectedDate)).toBeDefined()
  })

  it('shows an explicit fallback when sortBy is closed_at and closed_at is null', () => {
    const ticket = buildTicket({
      status: 'open',
      closed_at: null,
    })

    render(<TicketList tickets={[ticket]} sortBy="closed_at" />)

    expect(screen.getByText('Not closed')).toBeDefined()
    expect(screen.queryByText(formatDateLabel(ticket.created_at, 'created_at'))).toBeNull()
  })

  it('uses rounded selected card classes without left-border selection classes', () => {
    const ticket = buildTicket()
    const view = render(
      <TicketList
        tickets={[ticket]}
        selectedTicketId={ticket.id}
      />,
    )

    const item = view.getByTestId(`ticket-item-${ticket.id}`)
    expect(item.className.includes('ring-1')).toBe(true)
    expect(item.className.includes('border-l-')).toBe(false)
  })

  it('renders a clipped list shell with an internal scroll viewport', () => {
    const ticket = buildTicket()
    const view = render(<TicketList tickets={[ticket]} />)

    const shell = view.getByTestId('ticket-list-shell')
    const viewport = view.getByTestId('ticket-list-viewport')
    expect(shell.className.includes('overflow-hidden')).toBe(true)
    expect(viewport.className.includes('overflow-y-auto')).toBe(true)
  })

  it('renders a list-owned header section when header content is provided', () => {
    const ticket = buildTicket()
    const view = render(
      <TicketList
        tickets={[ticket]}
        header={<div data-testid="header-slot">Filters and controls</div>}
      />,
    )

    expect(view.getByTestId('ticket-list-header')).toBeDefined()
    expect(view.getByTestId('header-slot')).toBeDefined()
  })
})
