import { z } from 'zod'
import { BACKEND_TYPES } from '@kombuse/types'

const booleanQuerySchema = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((value) => {
  if (typeof value === 'boolean') {
    return value
  }
  return value === 'true'
})

export const sessionFiltersSchema = z.object({
  ticket_id: z.coerce.number().int().positive().optional(),
  project_id: z.string().optional(),
  agent_id: z.string().min(1).optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'aborted', 'stopped']).optional(),
  terminal_reason: z.string().trim().min(1).optional(),
  has_backend_session_id: booleanQuerySchema.optional(),
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
  model_preference: z.string().trim().optional(),
  agent_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
})

export const sessionEventFiltersSchema = z.object({
  since_seq: z.coerce.number().int().nonnegative().optional(),
  event_type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
})

export const sessionDiagnosticsQuerySchema = z.object({
  recent_limit: z.coerce.number().int().positive().max(200).default(20),
})

export type SessionFiltersQuery = z.infer<typeof sessionFiltersSchema>
export type CreateSessionBody = z.infer<typeof createSessionSchema>
export type SessionEventFiltersQuery = z.infer<typeof sessionEventFiltersSchema>
export type SessionDiagnosticsQuery = z.infer<typeof sessionDiagnosticsQuerySchema>
