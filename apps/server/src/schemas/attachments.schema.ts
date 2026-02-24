import { z } from 'zod'

export const attachmentFiltersSchema = z.object({
  uploaded_by_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type AttachmentFiltersQuery = z.infer<typeof attachmentFiltersSchema>
