import type { z } from 'zod'
import type { ticketViewSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type TicketView = z.infer<typeof ticketViewSchema>

/**
 * Input for upserting a ticket view
 */
export interface UpsertTicketViewInput {
  ticket_id: number
  profile_id: string
}
