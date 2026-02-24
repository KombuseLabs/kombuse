/**
 * Records when a user last viewed a ticket
 */
export interface TicketView {
  id: number
  ticket_id: number
  profile_id: string
  last_viewed_at: string
}

/**
 * Input for upserting a ticket view
 */
export interface UpsertTicketViewInput {
  ticket_id: number
  profile_id: string
}
