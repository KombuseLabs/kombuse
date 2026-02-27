import type { z } from 'zod'
import type {
  ticketStatusSchema,
  ticketPrioritySchema,
  ticketSchema,
  ticketWithRelationsSchema,
  ticketWithLabelsSchema,
  ticketStatusCountsSchema,
} from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type TicketPriority = z.infer<typeof ticketPrioritySchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketWithRelations = z.infer<typeof ticketWithRelationsSchema>
export type TicketWithLabels = z.infer<typeof ticketWithLabelsSchema>
export type TicketStatusCounts = z.infer<typeof ticketStatusCountsSchema>

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
  /** Profile ID of the current viewer - used to compute has_unread */
  viewer_id?: string
  milestone_id?: number
  label_ids?: number[]
  search?: string
  sort_by?: 'created_at' | 'updated_at' | 'closed_at' | 'opened_at' | 'last_activity_at' | 'priority'
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
  triggers_enabled?: boolean
  loop_protection_enabled?: boolean
  status?: TicketStatus
  priority?: TicketPriority
  assignee_id?: string
  milestone_id?: number
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
  triggers_enabled?: boolean
  loop_protection_enabled?: boolean
  status?: TicketStatus
  priority?: TicketPriority | null
  assignee_id?: string | null
  milestone_id?: number | null
  updated_by_id?: string
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
