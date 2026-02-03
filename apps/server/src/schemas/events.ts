import { z } from 'zod'

export const createEventSchema = z.object({
  event_type: z.string().min(1),
  project_id: z.string().optional(),
  ticket_id: z.coerce.number().int().positive().optional(),
  comment_id: z.coerce.number().int().positive().optional(),
  actor_id: z.string().optional(),
  actor_type: z.enum(['user', 'agent', 'system']),
  payload: z.record(z.unknown()),
})

export const eventFiltersSchema = z.object({
  event_type: z.string().optional(),
  project_id: z.string().optional(),
  ticket_id: z.coerce.number().int().positive().optional(),
  actor_id: z.string().optional(),
  actor_type: z.enum(['user', 'agent', 'system']).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export const subscriptionSchema = z.object({
  subscriber_id: z.string().min(1),
  event_type: z.string().min(1),
  project_id: z.string().optional(),
})

export const acknowledgeEventsSchema = z.object({
  last_event_id: z.coerce.number().int().positive(),
})

export type CreateEventBody = z.infer<typeof createEventSchema>
export type EventFiltersQuery = z.infer<typeof eventFiltersSchema>
export type SubscriptionBody = z.infer<typeof subscriptionSchema>
export type AcknowledgeEventsBody = z.infer<typeof acknowledgeEventsSchema>
