import { z } from 'zod'

const MAX_LIMIT = 500

export const databaseQuerySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
})

export type DatabaseQueryBody = z.infer<typeof databaseQuerySchema>
