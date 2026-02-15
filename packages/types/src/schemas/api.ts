import { z } from 'zod'
import { agentInvocationSchema } from './agents'
import {
  commentWithAuthorSchema,
  databaseTableInfoSchema,
  eventWithActorSchema,
  ticketSchema,
} from './entities'

export const apiErrorSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1).optional(),
  details: z.unknown().optional(),
}).catchall(z.unknown())

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string().min(1),
  code: z.string().min(1),
})

export const validationErrorDetailsSchema = z.object({
  issues: z.array(validationIssueSchema).min(1),
})

export const databaseRowSchema = z.record(z.string(), z.unknown())

export const databaseTablesResponseSchema = z.object({
  tables: z.array(databaseTableInfoSchema),
})

export const databaseQueryResponseSchema = z.object({
  rows: z.array(databaseRowSchema),
  count: z.number().int().nonnegative(),
  sql: z.string().min(1),
})

export const claudeCodeSessionItemSchema = z.record(z.string(), z.unknown())

export const claudeCodeValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string().min(1),
  code: z.string().min(1),
})

export const claudeCodeValidationErrorSchema = z.object({
  index: z.number().int().nonnegative(),
  type: z.string().min(1),
  issues: z.array(claudeCodeValidationIssueSchema),
})

export const claudeCodeValidationByTypeSchema = z.record(
  z.string(),
  z.object({
    valid: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
  })
)

export const claudeCodeSessionResponseSchema = z.object({
  items: z.array(claudeCodeSessionItemSchema),
  count: z.number().int().nonnegative(),
  events: z.array(z.record(z.string(), z.unknown())),
  validation: z.object({
    valid: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    byType: claudeCodeValidationByTypeSchema,
    errors: z.array(claudeCodeValidationErrorSchema),
  }),
})

export const ticketClaimFailureResponseSchema = z.object({
  error: z.string().min(1),
  ticket: ticketSchema.nullable(),
})

export const agentProcessEventResponseSchema = z.object({
  event_id: z.number().int().positive(),
  invocations_created: z.number().int().nonnegative(),
  invocations: z.array(agentInvocationSchema),
})

export const ticketTimelineItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('comment'),
    timestamp: z.string().min(1),
    data: commentWithAuthorSchema,
  }),
  z.object({
    type: z.literal('event'),
    timestamp: z.string().min(1),
    data: eventWithActorSchema,
  }),
])

export const ticketTimelineResponseSchema = z.object({
  items: z.array(ticketTimelineItemSchema),
  total: z.number().int().nonnegative(),
})

export type ApiError = z.infer<typeof apiErrorSchema>
export type DatabaseQueryResponse = z.infer<typeof databaseQueryResponseSchema>
export type ClaudeCodeSessionResponse = z.infer<typeof claudeCodeSessionResponseSchema>
export type AgentProcessEventResponse = z.infer<typeof agentProcessEventResponseSchema>
export type TicketTimelineResponse = z.infer<typeof ticketTimelineResponseSchema>
