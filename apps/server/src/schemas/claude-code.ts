import { z } from 'zod'

export const importClaudeCodeProjectsSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
})

export type ImportClaudeCodeProjectsBody = z.infer<typeof importClaudeCodeProjectsSchema>
