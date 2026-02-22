import type {
  Ticket,
  TicketStatusCounts,
  TicketView,
  TicketWithLabels,
  TicketWithRelations,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  ClaimTicketInput,
  ClaimResult,
} from '@kombuse/types'
import { ticketsRepository, ticketViewsRepository, agentInvocationsRepository } from '@kombuse/persistence'
import { readUserDefaultMaxChainDepth, MAX_CHAIN_DEPTH } from './session-preferences-service'

/**
 * Service interface for ticket operations
 */
export interface ITicketService {
  list(filters?: TicketFilters): Ticket[]
  listWithLabels(filters?: TicketFilters): TicketWithLabels[]
  listWithRelations(filters?: TicketFilters): TicketWithRelations[]
  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // get(id: number): Ticket | null
  // getWithRelations(id: number): TicketWithRelations | null
  getByNumber(projectId: string, ticketNumber: number): Ticket | null
  getByNumberWithRelations(projectId: string, ticketNumber: number): TicketWithRelations | null
  create(input: CreateTicketInput): Ticket
  update(projectId: string, ticketNumber: number, input: UpdateTicketInput, updatedById?: string): Ticket
  delete(projectId: string, ticketNumber: number): void
  claim(projectId: string, ticketNumber: number, input: Omit<ClaimTicketInput, 'ticket_id'>): ClaimResult
  unclaim(projectId: string, ticketNumber: number, requesterId?: string, force?: boolean): ClaimResult
  extendClaim(projectId: string, ticketNumber: number, additionalMinutes: number): ClaimResult
  countByStatus(projectId: string): TicketStatusCounts
  markViewed(projectId: string, ticketNumber: number, profileId: string): TicketView
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

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // get(id: number): Ticket | null {
  //   return ticketsRepository.get(id)
  // }

  getByNumber(projectId: string, ticketNumber: number): Ticket | null {
    return ticketsRepository.getByNumber(projectId, ticketNumber)
  }

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // getWithRelations(id: number): TicketWithRelations | null {
  //   const ticket = ticketsRepository.getWithRelations(id)
  //   if (!ticket) return null
  //   if (ticket.loop_protection_enabled) {
  //     const maxDepth = readUserDefaultMaxChainDepth() ?? MAX_CHAIN_DEPTH
  //     const recentCount = agentInvocationsRepository.countRecentByTicketId(ticket.id)
  //     ticket.loop_protection_tripped = recentCount >= maxDepth
  //   }
  //   return ticket
  // }

  getByNumberWithRelations(projectId: string, ticketNumber: number): TicketWithRelations | null {
    const ticket = ticketsRepository.getByNumberWithRelations(projectId, ticketNumber)
    if (!ticket) return null

    if (ticket.loop_protection_enabled) {
      const maxDepth = readUserDefaultMaxChainDepth() ?? MAX_CHAIN_DEPTH
      const recentCount = agentInvocationsRepository.countRecentByTicketId(ticket.id)
      ticket.loop_protection_tripped = recentCount >= maxDepth
    }

    return ticket
  }

  create(input: CreateTicketInput): Ticket {
    const ticket = ticketsRepository.create(input)
    return ticket
  }

  update(projectId: string, ticketNumber: number, input: UpdateTicketInput, updatedById?: string): Ticket {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      throw new Error(`Ticket #${ticketNumber} not found in project ${projectId}`)
    }

    const updated = ticketsRepository.update(existing.id, input, updatedById)
    if (!updated) {
      throw new Error(`Failed to update ticket #${ticketNumber}`)
    }

    return updated
  }

  delete(projectId: string, ticketNumber: number): void {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      throw new Error(`Ticket #${ticketNumber} not found in project ${projectId}`)
    }
    const success = ticketsRepository.delete(existing.id)
    if (!success) {
      throw new Error(`Ticket #${ticketNumber} not found`)
    }
  }

  claim(projectId: string, ticketNumber: number, input: Omit<ClaimTicketInput, 'ticket_id'>): ClaimResult {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }
    return ticketsRepository.claim({ ticket_id: existing.id, ...input })
  }

  unclaim(projectId: string, ticketNumber: number, requesterId?: string, force?: boolean): ClaimResult {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }
    return ticketsRepository.unclaim(existing.id, requesterId, force)
  }

  extendClaim(projectId: string, ticketNumber: number, additionalMinutes: number): ClaimResult {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      return { success: false, ticket: null, reason: 'Ticket not found' }
    }
    return ticketsRepository.extendClaim(existing.id, additionalMinutes)
  }

  countByStatus(projectId: string): TicketStatusCounts {
    return ticketsRepository.countByStatus(projectId)
  }

  markViewed(projectId: string, ticketNumber: number, profileId: string): TicketView {
    const existing = ticketsRepository.getByNumber(projectId, ticketNumber)
    if (!existing) {
      throw new Error(`Ticket #${ticketNumber} not found in project ${projectId}`)
    }
    return ticketViewsRepository.upsert({
      ticket_id: existing.id,
      profile_id: profileId,
    })
  }
}

// Singleton instance for convenience
export const ticketService = new TicketService()
