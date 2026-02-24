import { z } from 'zod'

export const initProjectBodySchema = z.object({
  skipMcpJson: z.boolean().optional(),
  skipAgentsMd: z.boolean().optional(),
  skipKombuseDir: z.boolean().optional(),
  skipGitignore: z.boolean().optional(),
})

export type InitProjectBody = z.infer<typeof initProjectBodySchema>
