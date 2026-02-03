import type {
  Ticket,
  TicketWithActivities,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
} from '@kombuse/types'
import { ticketsRepository } from '@kombuse/persistence'

/**
 * Service interface for ticket operations
 */
export interface ITicketService {
  list(filters?: TicketFilters): Ticket[]
  get(id: number): TicketWithActivities | null
  create(input: CreateTicketInput): Ticket
  update(id: number, input: UpdateTicketInput): Ticket
  delete(id: number): void
}

/**
 * Ticket service implementation with business logic
 */
export class TicketService implements ITicketService {
  list(filters?: TicketFilters): Ticket[] {
    return ticketsRepository.list(filters)
  }

  get(id: number): TicketWithActivities | null {
    return ticketsRepository.get(id)
  }

  create(input: CreateTicketInput): Ticket {
    const ticket = ticketsRepository.create(input)

    // Log the creation activity
    ticketsRepository.addActivity(
      ticket.id,
      'created',
      `Ticket "${ticket.title}" created`
    )

    return ticket
  }

  update(id: number, input: UpdateTicketInput): Ticket {
    const existing = ticketsRepository.get(id)
    if (!existing) {
      throw new Error(`Ticket ${id} not found`)
    }

    const updated = ticketsRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update ticket ${id}`)
    }

    // Log status changes
    if (input.status && input.status !== existing.status) {
      ticketsRepository.addActivity(
        id,
        'status_changed',
        `Status changed from "${existing.status}" to "${input.status}"`
      )
    }

    return updated
  }

  delete(id: number): void {
    const success = ticketsRepository.delete(id)
    if (!success) {
      throw new Error(`Ticket ${id} not found`)
    }
  }
}

// Singleton instance for convenience
export const ticketService = new TicketService()
