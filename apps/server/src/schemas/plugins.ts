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

export const pluginInstallSchema = z.object({
  package_path: z.string().min(1),
  project_id: z.string().min(1),
  overwrite: z.boolean().optional(),
})

export const pluginUpdateSchema = z.object({
  is_enabled: z.boolean().optional(),
})

export const pluginFiltersSchema = z.object({
  project_id: z.string().min(1).optional(),
})

export const availablePluginsSchema = z.object({
  project_id: z.string().min(1),
})

export const pluginUninstallQuerySchema = z.object({
  mode: z.enum(['orphan', 'delete']).optional().default('orphan'),
})

export const pluginInstallResultSchema = z.object({
  plugin_id: z.string().min(1),
  plugin_name: z.string().min(1),
  agents_created: z.number().int().nonnegative(),
  labels_created: z.number().int().nonnegative(),
  labels_merged: z.number().int().nonnegative(),
  triggers_created: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
})

export type PluginInstallBody = z.infer<typeof pluginInstallSchema>
export type PluginUpdateBody = z.infer<typeof pluginUpdateSchema>
export type PluginFiltersQuery = z.infer<typeof pluginFiltersSchema>
export type AvailablePluginsQuery = z.infer<typeof availablePluginsSchema>
