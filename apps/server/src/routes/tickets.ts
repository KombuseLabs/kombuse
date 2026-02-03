import type { FastifyInstance } from 'fastify'
import { ticketService } from '@kombuse/services'
import {
  createTicketSchema,
  updateTicketSchema,
  ticketFiltersSchema,
} from '../schemas/tickets'

export async function ticketRoutes(fastify: FastifyInstance) {
  // List tickets with optional filters
  fastify.get('/tickets', async (request, reply) => {
    const parseResult = ticketFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const filters = parseResult.data
    return ticketService.list(filters)
  })

  // Get single ticket with activities
  fastify.get<{
    Params: { id: string }
  }>('/tickets/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    const ticket = ticketService.get(id)
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' })
    }
    return ticket
  })

  // Create ticket
  fastify.post('/tickets', async (request, reply) => {
    const parseResult = createTicketSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const ticket = ticketService.create(parseResult.data)
    return reply.status(201).send(ticket)
  })

  // Update ticket
  fastify.patch<{
    Params: { id: string }
  }>('/tickets/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    const parseResult = updateTicketSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const ticket = ticketService.update(id, parseResult.data)
      return ticket
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // Delete ticket
  fastify.delete<{
    Params: { id: string }
  }>('/tickets/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    try {
      ticketService.delete(id)
      return reply.status(204).send()
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })
}
