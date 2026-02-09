import type { Label } from './labels'
import type { Profile } from './profiles'

/**
 * Ticket status enum matching database CHECK constraint
 */
export type TicketStatus = 'open' | 'closed' | 'in_progress' | 'blocked'

/**
 * Priority levels 0-4 (0 = lowest, 4 = highest)
 */
export type TicketPriority = 0 | 1 | 2 | 3 | 4

/**
 * Core ticket entity matching database schema
 */
export interface Ticket {
  id: number
  project_id: string
  author_id: string
  assignee_id: string | null
  /** Current active claim holder (may differ from assignee_id) */
  claimed_by_id: string | null
  title: string
  body: string | null
  status: TicketStatus
  priority: TicketPriority | null
  external_source: string | null
  external_id: string | null
  external_url: string | null
  synced_at: string | null
  /** Timestamp when the ticket was claimed by a claimer */
  claimed_at: string | null
  /** Optional expiration for the claim (for stale assignment cleanup) */
  claim_expires_at: string | null
  created_at: string
  updated_at: string
  /** Timestamp when the ticket was (re)opened */
  opened_at: string
  /** Timestamp when the ticket was closed (null if open) */
  closed_at: string | null
  /** Timestamp of the most recent activity on the ticket */
  last_activity_at: string
}

/**
 * Ticket with related entities
 */
export interface TicketWithRelations extends Ticket {
  author: Profile
  assignee: Profile | null
  labels: Label[]
}

/**
 * Ticket with labels only (for list views)
 */
export interface TicketWithLabels extends Ticket {
  labels: Label[]
}

/**
 * Filters for listing tickets
 */
export interface TicketFilters {
  project_id?: string
  status?: TicketStatus
  priority?: TicketPriority
  author_id?: string
  assignee_id?: string
  claimed_by_id?: string
  /** Filter for unclaimed tickets (claimed_by_id IS NULL) */
  unclaimed?: boolean
  /** Filter for tickets with expired claims */
  expired_claims?: boolean
  label_ids?: number[]
  search?: string
  sort_by?: 'created_at' | 'updated_at' | 'closed_at' | 'opened_at' | 'last_activity_at'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * Input for creating a ticket
 */
export interface CreateTicketInput {
  project_id: string
  author_id: string
  title: string
  body?: string
  status?: TicketStatus
  priority?: TicketPriority
  assignee_id?: string
  label_ids?: number[]
  external_source?: string
  external_id?: string
  external_url?: string
}

/**
 * Input for updating a ticket (all fields optional)
 */
export interface UpdateTicketInput {
  title?: string
  body?: string
  status?: TicketStatus
  priority?: TicketPriority
  assignee_id?: string | null
  external_source?: string
  external_id?: string
  external_url?: string
}

/**
 * Input for adding/removing labels from a ticket
 */
export interface TicketLabelInput {
  ticket_id: number
  label_id: number
  added_by_id?: string
}

/**
 * Input for claiming a ticket
 */
export interface ClaimTicketInput {
  ticket_id: number
  claimer_id: string
  /** Optional duration in minutes for the claim (defaults to no expiration) */
  duration_minutes?: number
}

/**
 * Result of a claim operation
 */
export interface ClaimResult {
  success: boolean
  ticket: Ticket | null
  /** Reason if claim failed (e.g., already claimed by another) */
  reason?: string
}
