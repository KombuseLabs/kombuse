import type { TicketView, UpsertTicketViewInput } from '@kombuse/types'
import { getDatabase } from './database'

export const ticketViewsRepository = {
  /**
   * Record that a user viewed a ticket (upsert).
   * Updates last_viewed_at to now if the record already exists.
   */
  upsert(input: UpsertTicketViewInput): TicketView {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO ticket_views (ticket_id, profile_id, last_viewed_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(ticket_id, profile_id) DO UPDATE SET
        last_viewed_at = datetime('now')
    `).run(input.ticket_id, input.profile_id)

    return db.prepare(`
      SELECT * FROM ticket_views
      WHERE ticket_id = ? AND profile_id = ?
    `).get(input.ticket_id, input.profile_id) as TicketView
  },

  /**
   * Get the last time a user viewed a specific ticket.
   */
  getLastViewed(ticketId: number, profileId: string): TicketView | null {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT * FROM ticket_views
      WHERE ticket_id = ? AND profile_id = ?
    `).get(ticketId, profileId) as TicketView | undefined
    return row ?? null
  },
}
