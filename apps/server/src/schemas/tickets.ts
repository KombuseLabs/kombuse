import { z } from 'zod'
import type { TicketPriority } from '@kombuse/types'

const prioritySchema = z
  .number()
  .int()
  .min(0)
  .max(4)
  .transform((val) => val as TicketPriority)

export const createTicketSchema = z.object({
  project_id: z.string().min(1),
  author_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  status: z.enum(['open', 'closed', 'in_progress', 'blocked']).optional(),
  priority: prioritySchema.optional(),
  assignee_id: z.string().optional(),
  label_ids: z.array(z.coerce.number().int().positive()).optional(),
  external_source: z.string().optional(),
  external_id: z.string().optional(),
  external_url: z.string().url().optional(),
})

export const updateTicketSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  status: z.enum(['open', 'closed', 'in_progress', 'blocked']).optional(),
  priority: prioritySchema.optional(),
  assignee_id: z.string().nullable().optional(),
  external_source: z.string().optional(),
  external_id: z.string().optional(),
  external_url: z.string().url().optional(),
})

export const claimTicketSchema = z.object({
  claimer_id: z.string().min(1),
  duration_minutes: z.coerce.number().int().positive().optional(),
})

export const unclaimTicketSchema = z.object({
  requester_id: z.string().min(1).optional(),
  force: z.coerce.boolean().optional(),
})

export const extendClaimSchema = z.object({
  additional_minutes: z.coerce.number().int().positive(),
})

export const ticketFiltersSchema = z.object({
  project_id: z.string().optional(),
  status: z.enum(['open', 'closed', 'in_progress', 'blocked']).optional(),
  priority: z.coerce
    .number()
    .int()
    .min(0)
    .max(4)
    .transform((val) => val as TicketPriority)
    .optional(),
  author_id: z.string().optional(),
  assignee_id: z.string().optional(),
  claimed_by_id: z.string().optional(),
  unclaimed: z.coerce.boolean().optional(),
  expired_claims: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type CreateTicketBody = z.infer<typeof createTicketSchema>
export type UpdateTicketBody = z.infer<typeof updateTicketSchema>
export type ClaimTicketBody = z.infer<typeof claimTicketSchema>
export type UnclaimTicketBody = z.infer<typeof unclaimTicketSchema>
export type ExtendClaimBody = z.infer<typeof extendClaimSchema>
export type TicketFiltersQuery = z.infer<typeof ticketFiltersSchema>
