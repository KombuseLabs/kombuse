import { z } from 'zod'

export const sessionFiltersSchema = z.object({
  status: z.enum(['running', 'completed', 'failed', 'aborted']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const sessionEventFiltersSchema = z.object({
  since_seq: z.coerce.number().int().nonnegative().optional(),
  event_type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
})

export type SessionFiltersQuery = z.infer<typeof sessionFiltersSchema>
export type SessionEventFiltersQuery = z.infer<typeof sessionEventFiltersSchema>
