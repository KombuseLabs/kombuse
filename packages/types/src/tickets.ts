/**
 * Ticket status enum matching database CHECK constraint
 */
export type TicketStatus = 'open' | 'closed' | 'in_progress'

/**
 * Priority levels 0-4 (0 = lowest, 4 = highest)
 */
export type TicketPriority = 0 | 1 | 2 | 3 | 4

/**
 * Core ticket entity matching database schema
 */
export interface Ticket {
  id: number
  title: string
  body: string | null
  status: TicketStatus
  priority: TicketPriority | null
  project_id: string | null
  github_id: number | null
  repo_name: string | null
  created_at: string
  updated_at: string
}

/**
 * Activity log for ticket changes
 */
export interface TicketActivity {
  id: number
  ticket_id: number
  action: string
  details: string | null
  created_at: string
}

/**
 * Ticket with associated activities
 */
export interface TicketWithActivities extends Ticket {
  activities: TicketActivity[]
}

/**
 * Filters for listing tickets
 */
export interface TicketFilters {
  status?: TicketStatus
  priority?: TicketPriority
  project_id?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Input for creating a ticket
 */
export interface CreateTicketInput {
  title: string
  body?: string
  status?: TicketStatus
  priority?: TicketPriority
  project_id?: string
  github_id?: number
  repo_name?: string
}

/**
 * Input for updating a ticket (all fields optional)
 */
export interface UpdateTicketInput {
  title?: string
  body?: string
  status?: TicketStatus
  priority?: TicketPriority
  project_id?: string
  github_id?: number
  repo_name?: string
}
