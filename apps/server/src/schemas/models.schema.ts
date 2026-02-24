import { z } from 'zod'
import { BACKEND_TYPES } from '@kombuse/types'

export const modelCatalogQuerySchema = z.object({
  backend_type: z.enum([
    BACKEND_TYPES.CLAUDE_CODE,
    BACKEND_TYPES.CODEX,
    BACKEND_TYPES.MOCK,
  ]),
})
