import type { FastifyInstance } from 'fastify'
import { eventService } from '@kombuse/services'
import {
  createEventSchema,
  eventFiltersSchema,
  subscriptionSchema,
  acknowledgeEventsSchema,
} from '../schemas/events'

export async function eventRoutes(fastify: FastifyInstance) {
  // List events with optional filters
  fastify.get('/events', async (request, reply) => {
    const parseResult = eventFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return eventService.list(parseResult.data)
  })

  // Get events for a ticket by project-scoped number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/events', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    try {
      return eventService.getByTicket(request.params.projectId, ticketNumber)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      throw error
    }
  })

  // Create event (internal/system use)
  fastify.post('/events', async (request, reply) => {
    const parseResult = createEventSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const event = eventService.create(parseResult.data)
    return reply.status(201).send(event)
  })

  // List subscriptions for a subscriber
  fastify.get<{
    Querystring: { subscriber_id: string }
  }>('/subscriptions', async (request, reply) => {
    const subscriberId = (request.query as { subscriber_id?: string }).subscriber_id
    if (!subscriberId) {
      return reply.status(400).send({ error: 'subscriber_id query parameter is required' })
    }

    return eventService.listSubscriptions(subscriberId)
  })

  // Create event subscription
  fastify.post('/subscriptions', async (request, reply) => {
    const parseResult = subscriptionSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const subscription = eventService.createSubscription(parseResult.data)
    return reply.status(201).send(subscription)
  })

  // Get unprocessed events for a subscription
  fastify.get<{
    Params: { id: string }
  }>('/subscriptions/:id/events', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid subscription ID' })
    }

    try {
      const result = eventService.getUnprocessedEvents(id)
      return result
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Subscription not found' })
      }
      throw error
    }
  })

  // Mark events as processed
  fastify.post<{
    Params: { id: string }
  }>('/subscriptions/:id/acknowledge', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid subscription ID' })
    }

    const parseResult = acknowledgeEventsSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      eventService.acknowledgeEvents(id, parseResult.data.last_event_id)
      return { success: true }
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Subscription not found' })
      }
      throw error
    }
  })

  // Delete subscription
  fastify.delete<{
    Params: { id: string }
  }>('/subscriptions/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid subscription ID' })
    }

    try {
      eventService.deleteSubscription(id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Subscription not found' })
      }
      throw error
    }
  })
}
