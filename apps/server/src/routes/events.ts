import type { FastifyInstance } from 'fastify'
import { eventsRepository, eventSubscriptionsRepository } from '@kombuse/persistence'
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

    return eventsRepository.list(parseResult.data)
  })

  // Get events for a ticket
  fastify.get<{
    Params: { ticketId: string }
  }>('/tickets/:ticketId/events', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    return eventsRepository.getByTicket(ticketId)
  })

  // Create event (internal/system use)
  fastify.post('/events', async (request, reply) => {
    const parseResult = createEventSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const event = eventsRepository.create(parseResult.data)
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

    return eventSubscriptionsRepository.list(subscriberId)
  })

  // Create event subscription
  fastify.post('/subscriptions', async (request, reply) => {
    const parseResult = subscriptionSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const subscription = eventSubscriptionsRepository.create(parseResult.data)
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

    const subscription = eventSubscriptionsRepository.get(id)
    if (!subscription) {
      return reply.status(404).send({ error: 'Subscription not found' })
    }

    const events = eventSubscriptionsRepository.getUnprocessedEventsForSubscription(id)
    return { subscription, events }
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

    const success = eventSubscriptionsRepository.updateLastProcessed(
      id,
      parseResult.data.last_event_id
    )
    if (!success) {
      return reply.status(404).send({ error: 'Subscription not found' })
    }

    return { success: true }
  })

  // Delete subscription
  fastify.delete<{
    Params: { id: string }
  }>('/subscriptions/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid subscription ID' })
    }

    const deleted = eventSubscriptionsRepository.delete(id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Subscription not found' })
    }
    return reply.status(204).send()
  })
}
