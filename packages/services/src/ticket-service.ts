import type {
  Ticket,
  TicketWithLabels,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  ClaimTicketInput,
  ClaimResult,
} from '@kombuse/types'
import { ticketsRepository } from '@kombuse/persistence'

/**
 * Service interface for ticket operations
 */
export interface ITicketService {
  list(filters?: TicketFilters): Ticket[]
  listWithLabels(filters?: TicketFilters): TicketWithLabels[]
  get(id: number): Ticket | null
  create(input: CreateTicketInput): Ticket
  update(id: number, input: UpdateTicketInput): Ticket
  delete(id: number): void
  claim(input: ClaimTicketInput): ClaimResult
  unclaim(ticketId: number, requesterId?: string, force?: boolean): ClaimResult
  extendClaim(ticketId: number, additionalMinutes: number): ClaimResult
}

/**
 * Ticket service implementation with business logic
 */
export class TicketService implements ITicketService {
  list(filters?: TicketFilters): Ticket[] {
    return ticketsRepository.list(filters)
  }

  listWithLabels(filters?: TicketFilters): TicketWithLabels[] {
    return ticketsRepository.listWithLabels(filters)
  }

  get(id: number): Ticket | null {
    return ticketsRepository.get(id)
  }

  create(input: CreateTicketInput): Ticket {
    const ticket = ticketsRepository.create(input)
    // Note: Event logging is handled separately via eventsRepository
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

    // Note: Event logging for status changes is handled via eventsRepository
    return updated
  }

  delete(id: number): void {
    const success = ticketsRepository.delete(id)
    if (!success) {
      throw new Error(`Ticket ${id} not found`)
    }
  }

  claim(input: ClaimTicketInput): ClaimResult {
    return ticketsRepository.claim(input)
  }

  unclaim(ticketId: number, requesterId?: string, force?: boolean): ClaimResult {
    return ticketsRepository.unclaim(ticketId, requesterId, force)
  }

  extendClaim(ticketId: number, additionalMinutes: number): ClaimResult {
    return ticketsRepository.extendClaim(ticketId, additionalMinutes)
  }
}

// Singleton instance for convenience
export const ticketService = new TicketService()
