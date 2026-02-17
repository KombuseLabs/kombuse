import { z } from 'zod'

export const pluginExportSchema = z.object({
  package_name: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  project_id: z.string().min(1),
  agent_ids: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  overwrite: z.boolean().optional(),
})

export const pluginExportResultSchema = z.object({
  package_name: z.string(),
  directory: z.string(),
  agent_count: z.number().int().nonnegative(),
  label_count: z.number().int().nonnegative(),
  files: z.array(z.string()),
})

export type PluginExportBody = z.infer<typeof pluginExportSchema>
