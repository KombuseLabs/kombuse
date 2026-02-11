import type {
  Ticket,
  TicketView,
  TicketWithLabels,
  TicketWithRelations,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  ClaimTicketInput,
  ClaimResult,
} from '@kombuse/types'
import { ticketsRepository, ticketViewsRepository } from '@kombuse/persistence'

/**
 * Service interface for ticket operations
 */
export interface ITicketService {
  list(filters?: TicketFilters): Ticket[]
  listWithLabels(filters?: TicketFilters): TicketWithLabels[]
  listWithRelations(filters?: TicketFilters): TicketWithRelations[]
  get(id: number): Ticket | null
  getWithRelations(id: number): TicketWithRelations | null
  create(input: CreateTicketInput): Ticket
  update(id: number, input: UpdateTicketInput): Ticket
  delete(id: number): void
  claim(input: ClaimTicketInput): ClaimResult
  unclaim(ticketId: number, requesterId?: string, force?: boolean): ClaimResult
  extendClaim(ticketId: number, additionalMinutes: number): ClaimResult
  markViewed(ticketId: number, profileId: string): TicketView
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

  listWithRelations(filters?: TicketFilters): TicketWithRelations[] {
    return ticketsRepository.listWithRelations(filters)
  }

  get(id: number): Ticket | null {
    return ticketsRepository.get(id)
  }

  getWithRelations(id: number): TicketWithRelations | null {
    return ticketsRepository.getWithRelations(id)
  }

  create(input: CreateTicketInput): Ticket {
    const ticket = ticketsRepository.create(input)
    // Note: Event logging is handled separately via eventsRepository
    return ticket
  }

  update(id: number, input: UpdateTicketInput, updatedById?: string): Ticket {
    const existing = ticketsRepository.get(id)
    if (!existing) {
      throw new Error(`Ticket ${id} not found`)
    }

    const updated = ticketsRepository.update(id, input, updatedById)
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

  markViewed(ticketId: number, profileId: string): TicketView {
    return ticketViewsRepository.upsert({
      ticket_id: ticketId,
      profile_id: profileId,
    })
  }
}

// Singleton instance for convenience
export const ticketService = new TicketService()
