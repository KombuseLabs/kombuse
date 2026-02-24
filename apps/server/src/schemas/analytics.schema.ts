import { z } from 'zod'

export const sessionsPerDayQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type SessionsPerDayQuery = z.infer<typeof sessionsPerDayQuerySchema>

export const durationPercentilesQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type DurationPercentilesQuery = z.infer<typeof durationPercentilesQuerySchema>

export const pipelineStageDurationQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type PipelineStageDurationQuery = z.infer<typeof pipelineStageDurationQuerySchema>

export const mostFrequentReadsQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export type MostFrequentReadsQuery = z.infer<typeof mostFrequentReadsQuerySchema>

export const toolCallsPerSessionQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
  agent_id: z.string().min(1).optional(),
})

export type ToolCallsPerSessionQuery = z.infer<typeof toolCallsPerSessionQuerySchema>

export const slowestToolsQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type SlowestToolsQuery = z.infer<typeof slowestToolsQuerySchema>

export const toolCallVolumeQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
})

export type ToolCallVolumeQuery = z.infer<typeof toolCallVolumeQuerySchema>

export const ticketBurndownQuerySchema = z.object({
  project_id: z.string().min(1),
  days: z.coerce.number().int().positive().optional(),
  milestone_id: z.coerce.number().int().positive().optional(),
  label_id: z.coerce.number().int().positive().optional(),
})

export type TicketBurndownQuery = z.infer<typeof ticketBurndownQuerySchema>

export const agentRuntimePerTicketQuerySchema = z.object({
  project_id: z.string().min(1),
  limit: z.coerce.number().int().positive().optional(),
})

export type AgentRuntimePerTicketQuery = z.infer<typeof agentRuntimePerTicketQuerySchema>
