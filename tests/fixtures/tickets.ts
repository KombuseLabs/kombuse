import type { CreateTicketInput } from '@kombuse/types'

export const fixtures = {
  simpleTicket: {
    title: 'Simple test ticket',
    body: 'A basic ticket for testing',
  } satisfies CreateTicketInput,

  ticketWithPriority: {
    title: 'High priority ticket',
    body: 'This is urgent',
    priority: 4,
  } satisfies CreateTicketInput,

  ticketInProgress: {
    title: 'Work in progress',
    body: 'Currently being worked on',
    status: 'in_progress',
    priority: 2,
  } satisfies CreateTicketInput,

  closedTicket: {
    title: 'Completed ticket',
    body: 'This has been resolved',
    status: 'closed',
  } satisfies CreateTicketInput,

  ticketWithProject: {
    title: 'Project-specific ticket',
    body: 'Belongs to a specific project',
    project_id: 'proj-123',
  } satisfies CreateTicketInput,

  ticketWithGitHub: {
    title: 'GitHub issue',
    body: 'Imported from GitHub',
    github_id: 42,
    repo_name: 'org/repo',
  } satisfies CreateTicketInput,
}

export const bulkTickets: CreateTicketInput[] = [
  { title: 'Ticket 1', status: 'open' },
  { title: 'Ticket 2', status: 'open' },
  { title: 'Ticket 3', status: 'in_progress' },
  { title: 'Ticket 4', status: 'closed' },
  { title: 'Ticket 5', status: 'open', priority: 4 },
]
