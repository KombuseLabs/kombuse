import type {
  Event,
  EventWithActor,
  EventFilters,
  CreateEventInput,
  EventSubscription,
  EventSubscriptionInput,
} from '@kombuse/types'
import { eventsRepository, eventSubscriptionsRepository } from '@kombuse/persistence'

/**
 * Service interface for event and subscription operations
 */
export interface IEventService {
  // Event methods
  list(filters?: EventFilters): EventWithActor[]
  get(id: number): EventWithActor | null
  getByTicket(ticketId: number): EventWithActor[]
  create(input: CreateEventInput): EventWithActor

  // Subscription methods
  listSubscriptions(subscriberId: string): EventSubscription[]
  getSubscription(id: number): EventSubscription | null
  createSubscription(input: EventSubscriptionInput): EventSubscription
  getUnprocessedEvents(subscriptionId: number): { subscription: EventSubscription; events: Event[] }
  acknowledgeEvents(subscriptionId: number, lastEventId: number): void
  deleteSubscription(id: number): void
}

/**
 * Event service implementation with business logic
 */
export class EventService implements IEventService {
  // Event methods
  list(filters?: EventFilters): EventWithActor[] {
    return eventsRepository.list(filters)
  }

  get(id: number): EventWithActor | null {
    return eventsRepository.get(id)
  }

  getByTicket(ticketId: number): EventWithActor[] {
    return eventsRepository.getByTicket(ticketId)
  }

  create(input: CreateEventInput): EventWithActor {
    return eventsRepository.create(input)
  }

  // Subscription methods
  listSubscriptions(subscriberId: string): EventSubscription[] {
    return eventSubscriptionsRepository.list(subscriberId)
  }

  getSubscription(id: number): EventSubscription | null {
    return eventSubscriptionsRepository.get(id)
  }

  createSubscription(input: EventSubscriptionInput): EventSubscription {
    return eventSubscriptionsRepository.create(input)
  }

  getUnprocessedEvents(subscriptionId: number): { subscription: EventSubscription; events: Event[] } {
    const subscription = eventSubscriptionsRepository.get(subscriptionId)
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`)
    }
    const events = eventSubscriptionsRepository.getUnprocessedEventsForSubscription(subscriptionId)
    return { subscription, events }
  }

  acknowledgeEvents(subscriptionId: number, lastEventId: number): void {
    const success = eventSubscriptionsRepository.updateLastProcessed(subscriptionId, lastEventId)
    if (!success) {
      throw new Error(`Subscription ${subscriptionId} not found`)
    }
  }

  deleteSubscription(id: number): void {
    const success = eventSubscriptionsRepository.delete(id)
    if (!success) {
      throw new Error(`Subscription ${id} not found`)
    }
  }
}

// Singleton instance for convenience
export const eventService = new EventService()
