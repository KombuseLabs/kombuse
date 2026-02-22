import type { FastifyInstance } from 'fastify'
import { ticketService, commentService, eventService } from '@kombuse/services'
import type { TimelineItem } from '@kombuse/types'
import {
  createTicketSchema,
  claimTicketSchema,
  extendClaimSchema,
  updateTicketSchema,
  ticketFiltersSchema,
  ticketCountsQuerySchema,
  unclaimTicketSchema,
  markTicketViewedSchema,
} from '../schemas/tickets'

export async function ticketRoutes(fastify: FastifyInstance) {
  // List tickets with optional filters
  fastify.get('/tickets', async (request, reply) => {
    const parseResult = ticketFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const filters = parseResult.data
    return ticketService.listWithRelations(filters)
  })

  // Get ticket status counts (must be before /:id to avoid path conflict)
  fastify.get('/tickets/counts', async (request, reply) => {
    const parseResult = ticketCountsQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return ticketService.countByStatus(parseResult.data.project_id)
  })

  // Get ticket by per-project number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const ticket = ticketService.getByNumberWithRelations(request.params.projectId, ticketNumber)
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' })
    }
    return ticket
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.get<{
  //   Params: { id: string }
  // }>('/tickets/:id', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const ticket = ticketService.getWithRelations(id)
  //   if (!ticket) {
  //     return reply.status(404).send({ error: 'Ticket not found' })
  //   }
  //   return ticket
  // })

  // Create ticket
  fastify.post('/tickets', async (request, reply) => {
    const parseResult = createTicketSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const ticket = ticketService.create(parseResult.data)
      return reply.status(201).send(ticket)
    } catch (error) {
      const message = (error as Error).message
      if (message.includes('invalid for this project')) {
        return reply.status(400).send({ error: message })
      }
      throw error
    }
  })

  // Update ticket by project-scoped number
  fastify.patch<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = updateTicketSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { updated_by_id, ...input } = parseResult.data
      const ticket = ticketService.update(request.params.projectId, ticketNumber, input, updated_by_id)
      return ticket
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message })
      }
      if (message.includes('invalid for this project')) {
        return reply.status(400).send({ error: message })
      }
      if (message.includes('FOREIGN KEY constraint failed')) {
        return reply.status(422).send({ error: 'Invalid actor: the specified updated_by_id does not reference an existing profile' })
      }
      throw error
    }
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.patch<{
  //   Params: { id: string }
  // }>('/tickets/:id', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const parseResult = updateTicketSchema.safeParse(request.body)
  //   if (!parseResult.success) {
  //     return reply.status(400).send({ error: parseResult.error.issues })
  //   }
  //   try {
  //     const { updated_by_id, ...input } = parseResult.data
  //     const ticket = ticketService.update(id, input, updated_by_id)
  //     return ticket
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : String(error)
  //     if (message.includes('not found')) {
  //       return reply.status(404).send({ error: message })
  //     }
  //     if (message.includes('invalid for this project')) {
  //       return reply.status(400).send({ error: message })
  //     }
  //     if (message.includes('FOREIGN KEY constraint failed')) {
  //       return reply.status(422).send({ error: 'Invalid actor: the specified updated_by_id does not reference an existing profile' })
  //     }
  //     throw error
  //   }
  // })

  // Claim ticket by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/claim', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = claimTicketSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const result = ticketService.claim(
      request.params.projectId,
      ticketNumber,
      parseResult.data,
    )

    if (!result.success) {
      const status = result.ticket ? 409 : 404
      return reply.status(status).send({ error: result.reason, ticket: result.ticket })
    }

    return reply.send(result.ticket)
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.post<{
  //   Params: { id: string }
  // }>('/tickets/:id/claim', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const parseResult = claimTicketSchema.safeParse(request.body)
  //   if (!parseResult.success) {
  //     return reply.status(400).send({ error: parseResult.error.issues })
  //   }
  //   const result = ticketService.claim({ ticket_id: id, ...parseResult.data })
  //   if (!result.success) {
  //     const status = result.ticket ? 409 : 404
  //     return reply.status(status).send({ error: result.reason, ticket: result.ticket })
  //   }
  //   return reply.send(result.ticket)
  // })

  // Unclaim ticket by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/unclaim', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = unclaimTicketSchema.safeParse(request.body ?? {})
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const result = ticketService.unclaim(
      request.params.projectId,
      ticketNumber,
      parseResult.data.requester_id,
      parseResult.data.force ?? false
    )

    if (!result.success) {
      const status = result.ticket ? 409 : 404
      return reply.status(status).send({ error: result.reason, ticket: result.ticket })
    }

    return reply.send(result.ticket)
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.post<{
  //   Params: { id: string }
  // }>('/tickets/:id/unclaim', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const parseResult = unclaimTicketSchema.safeParse(request.body ?? {})
  //   if (!parseResult.success) {
  //     return reply.status(400).send({ error: parseResult.error.issues })
  //   }
  //   const result = ticketService.unclaim(id, parseResult.data.requester_id, parseResult.data.force ?? false)
  //   if (!result.success) {
  //     const status = result.ticket ? 409 : 404
  //     return reply.status(status).send({ error: result.reason, ticket: result.ticket })
  //   }
  //   return reply.send(result.ticket)
  // })

  // Extend claim duration by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/claim/extend', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = extendClaimSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const result = ticketService.extendClaim(
      request.params.projectId,
      ticketNumber,
      parseResult.data.additional_minutes
    )

    if (!result.success) {
      const status = result.ticket ? 409 : 404
      return reply.status(status).send({ error: result.reason, ticket: result.ticket })
    }

    return reply.send(result.ticket)
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.post<{
  //   Params: { id: string }
  // }>('/tickets/:id/claim/extend', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const parseResult = extendClaimSchema.safeParse(request.body)
  //   if (!parseResult.success) {
  //     return reply.status(400).send({ error: parseResult.error.issues })
  //   }
  //   const result = ticketService.extendClaim(id, parseResult.data.additional_minutes)
  //   if (!result.success) {
  //     const status = result.ticket ? 409 : 404
  //     return reply.status(status).send({ error: result.reason, ticket: result.ticket })
  //   }
  //   return reply.send(result.ticket)
  // })

  // Mark ticket as viewed by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/view', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = markTicketViewedSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const view = ticketService.markViewed(request.params.projectId, ticketNumber, parseResult.data.profile_id)
      return reply.send(view)
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.post<{
  //   Params: { id: string }
  // }>('/tickets/:id/view', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const ticket = ticketService.get(id)
  //   if (!ticket) {
  //     return reply.status(404).send({ error: 'Ticket not found' })
  //   }
  //   const parseResult = markTicketViewedSchema.safeParse(request.body)
  //   if (!parseResult.success) {
  //     return reply.status(400).send({ error: parseResult.error.issues })
  //   }
  //   const view = ticketService.markViewed(id, parseResult.data.profile_id)
  //   return reply.send(view)
  // })

  // Delete ticket by project-scoped number
  fastify.delete<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    try {
      ticketService.delete(request.params.projectId, ticketNumber)
      return reply.status(204).send()
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.delete<{
  //   Params: { id: string }
  // }>('/tickets/:id', async (request, reply) => {
  //   const id = parseInt(request.params.id, 10)
  //   if (isNaN(id)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   try {
  //     ticketService.delete(id)
  //     return reply.status(204).send()
  //   } catch (error) {
  //     return reply.status(404).send({ error: (error as Error).message })
  //   }
  // })

  // Get ticket timeline by project-scoped number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/timeline', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const ticket = ticketService.getByNumber(request.params.projectId, ticketNumber)
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' })
    }

    const comments = commentService.list({ ticket_id: ticket.id })
    const events = eventService.getByTicket(ticket.id)

    const items: TimelineItem[] = [
      ...comments.map((c) => ({
        type: 'comment' as const,
        timestamp: c.created_at,
        data: c,
      })),
      ...events.map((e) => ({
        type: 'event' as const,
        timestamp: e.created_at,
        data: e,
      })),
    ]

    // Sort chronologically (oldest first)
    items.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return { items, total: items.length }
  })

  // COMMENTED OUT — ticket #555: project_id + ticket_number is the canonical lookup
  // fastify.get<{
  //   Params: { id: string }
  // }>('/tickets/:id/timeline', async (request, reply) => {
  //   const ticketId = parseInt(request.params.id, 10)
  //   if (isNaN(ticketId)) {
  //     return reply.status(400).send({ error: 'Invalid ticket ID' })
  //   }
  //   const comments = commentService.list({ ticket_id: ticketId })
  //   const events = eventService.getByTicket(ticketId)
  //   const items: TimelineItem[] = [
  //     ...comments.map((c) => ({ type: 'comment' as const, timestamp: c.created_at, data: c })),
  //     ...events.map((e) => ({ type: 'event' as const, timestamp: e.created_at, data: e })),
  //   ]
  //   items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  //   return { items, total: items.length }
  // })
}
