import { z } from 'zod'

export const sessionsPerDayQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type SessionsPerDayQuery = z.infer<typeof sessionsPerDayQuerySchema>
