import { z } from 'zod'

export const pluginExportSchema = z.object({
  package_name: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  project_id: z.string().min(1),
  agent_ids: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  overwrite: z.boolean().optional(),
  archive_format: z.enum(['tar.gz']).optional(),
})

export const pluginExportResultSchema = z.object({
  package_name: z.string(),
  directory: z.string(),
  agent_count: z.number().int().nonnegative(),
  label_count: z.number().int().nonnegative(),
  file_count: z.number().int().nonnegative(),
  files: z.array(z.string()),
  archive: z.object({
    path: z.string(),
    checksum: z.string(),
    size: z.number().int().nonnegative(),
  }).optional(),
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
  agents_updated: z.number().int().nonnegative(),
  labels_created: z.number().int().nonnegative(),
  labels_merged: z.number().int().nonnegative(),
  triggers_created: z.number().int().nonnegative(),
  triggers_updated: z.number().int().nonnegative(),
  files_imported: z.number().int().nonnegative(),
  files_preserved: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
})

export const updatePluginFileSchema = z.object({
  content: z.string().min(1),
})

export const pluginFileSchema = z.object({
  id: z.number().int().positive(),
  plugin_id: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
  content_hash: z.string(),
  is_user_modified: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const pluginRemoteInstallSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  project_id: z.string().min(1),
  overwrite: z.boolean().optional(),
})

export const pluginPublishSchema = z.object({
  package_name: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  project_id: z.string().min(1),
  author: z.string().min(1).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  registry_url: z.string().url(),
  token: z.string().min(1),
  agent_ids: z.array(z.string().min(1)).optional(),
  channel: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  description: z.string().optional(),
  overwrite: z.boolean().optional(),
})

export const pluginPublishResultSchema = z.object({
  author: z.string(),
  name: z.string(),
  version: z.string(),
  channel: z.string(),
  download_url: z.string(),
})

export type PluginPublishBody = z.infer<typeof pluginPublishSchema>

export type PluginInstallBody = z.infer<typeof pluginInstallSchema>
export type PluginUpdateBody = z.infer<typeof pluginUpdateSchema>
export type PluginFiltersQuery = z.infer<typeof pluginFiltersSchema>
export type AvailablePluginsQuery = z.infer<typeof availablePluginsSchema>
export type PluginRemoteInstallBody = z.infer<typeof pluginRemoteInstallSchema>
