import { z } from 'zod'

export const upsertProfileSettingSchema = z.object({
  profile_id: z.string().min(1),
  setting_key: z.string().min(1),
  setting_value: z.string(),
})

export type UpsertProfileSettingBody = z.infer<typeof upsertProfileSettingSchema>
