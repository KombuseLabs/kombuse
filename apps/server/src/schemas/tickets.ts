import { z } from 'zod'
import type { TicketPriority } from '@kombuse/types'

const prioritySchema = z
  .number()
  .int()
  .min(0)
  .max(4)
  .transform((val) => val as TicketPriority)

export const createTicketSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  status: z.enum(['open', 'closed', 'in_progress']).optional(),
  priority: prioritySchema.optional(),
  project_id: z.string().optional(),
  github_id: z.number().int().optional(),
  repo_name: z.string().optional(),
})

export const updateTicketSchema = createTicketSchema.partial()

export const ticketFiltersSchema = z.object({
  status: z.enum(['open', 'closed', 'in_progress']).optional(),
  priority: z.coerce
    .number()
    .int()
    .min(0)
    .max(4)
    .transform((val) => val as TicketPriority)
    .optional(),
  project_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type CreateTicketBody = z.infer<typeof createTicketSchema>
export type UpdateTicketBody = z.infer<typeof updateTicketSchema>
export type TicketFiltersQuery = z.infer<typeof ticketFiltersSchema>
