import { z } from 'zod'

export const permissionLogFiltersSchema = z.object({
  tool_name: z.string().optional(),
  behavior: z.enum(['allow', 'deny', 'auto_approved']).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export type PermissionLogFiltersQuery = z.infer<typeof permissionLogFiltersSchema>
