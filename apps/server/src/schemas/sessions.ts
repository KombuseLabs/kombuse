import { z } from 'zod'
import { BACKEND_TYPES } from '@kombuse/types'

export const sessionFiltersSchema = z.object({
  status: z.enum(['running', 'completed', 'failed', 'aborted']).optional(),
  sort_by: z.enum(['created_at', 'updated_at']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const createSessionSchema = z.object({
  backend_type: z.enum([
    BACKEND_TYPES.CLAUDE_CODE,
    BACKEND_TYPES.CODEX,
    BACKEND_TYPES.MOCK,
  ]).optional(),
  agent_id: z.string().min(1).optional(),
})

export const sessionEventFiltersSchema = z.object({
  since_seq: z.coerce.number().int().nonnegative().optional(),
  event_type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
})

export type SessionFiltersQuery = z.infer<typeof sessionFiltersSchema>
export type CreateSessionBody = z.infer<typeof createSessionSchema>
export type SessionEventFiltersQuery = z.infer<typeof sessionEventFiltersSchema>
