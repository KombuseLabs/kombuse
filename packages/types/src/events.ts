/**
 * Actor type for events
 */
export type ActorType = 'user' | 'agent' | 'system'

/**
 * Core event entity
 */
export interface Event {
  id: number
  event_type: string
  project_id: string | null
  ticket_id: number | null
  comment_id: number | null
  actor_id: string | null
  actor_type: ActorType
  payload: string // JSON string
  created_at: string
}

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
  LABEL_ADDED: 'label.added',
  LABEL_REMOVED: 'label.removed',
  MENTION_CREATED: 'mention.created',
  AGENT_STARTED: 'agent.started',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Event subscription for tracking which events an agent has processed
 */
export interface EventSubscription {
  id: number
  subscriber_id: string
  event_type: string
  project_id: string | null
  last_processed_event_id: number | null
  created_at: string
}

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
