import type { z } from 'zod'
import type {
  actorTypeSchema,
  eventSchema,
  eventWithActorSchema,
  eventSubscriptionSchema,
} from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type ActorType = z.infer<typeof actorTypeSchema>
export type Event = z.infer<typeof eventSchema>
export type EventWithActor = z.infer<typeof eventWithActorSchema>
export type EventSubscription = z.infer<typeof eventSubscriptionSchema>

/**
 * Event with parsed payload
 */
export interface EventWithPayload<T = unknown> extends Omit<Event, 'payload'> {
  payload: T
}

/**
 * Input for creating an event
 */
export interface CreateEventInput {
  event_type: string
  project_id?: string
  ticket_id?: number
  comment_id?: number
  actor_id?: string
  actor_type: ActorType
  kombuse_session_id?: string
  payload: Record<string, unknown>
}

/**
 * Filters for listing events
 */
export interface EventFilters {
  event_type?: string
  project_id?: string
  ticket_id?: number
  actor_id?: string
  actor_type?: ActorType
  since?: string // ISO date string
  limit?: number
  offset?: number
}

/**
 * Common event types
 */
export const EVENT_TYPES = {
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_CLOSED: 'ticket.closed',
  TICKET_REOPENED: 'ticket.reopened',
  TICKET_CLAIMED: 'ticket.claimed',
  TICKET_UNCLAIMED: 'ticket.unclaimed',
  COMMENT_ADDED: 'comment.added',
  COMMENT_EDITED: 'comment.edited',
  COMMENT_DELETED: 'comment.deleted',
  LABEL_ADDED: 'label.added',
  LABEL_REMOVED: 'label.removed',
  MENTION_CREATED: 'mention.created',
  MILESTONE_CREATED: 'milestone.created',
  MILESTONE_UPDATED: 'milestone.updated',
  MILESTONE_DELETED: 'milestone.deleted',
  TICKET_MILESTONE_CHANGED: 'ticket.milestone_changed',
  AGENT_STARTED: 'agent.started',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Input for creating/updating an event subscription
 */
export interface EventSubscriptionInput {
  subscriber_id: string
  event_type: string
  project_id?: string
}

/**
 * Unprocessed events for a subscriber
 */
export interface UnprocessedEventsResult {
  events: Event[]
  subscription: EventSubscription
}
