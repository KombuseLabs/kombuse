import { getDatabase } from './database'

/**
 * Resolve (projectId, ticketNumber) to the internal ticket_id.
 * Uses the idx_tickets_project_number unique index.
 * Throws if the ticket does not exist.
 */
export function resolveTicketId(projectId: string, ticketNumber: number): number {
  const db = getDatabase()
  const row = db
    .prepare('SELECT id FROM tickets WHERE project_id = ? AND ticket_number = ?')
    .get(projectId, ticketNumber) as { id: number } | undefined
  if (!row) {
    throw new Error(`Ticket not found`)
  }
  return row.id
}
