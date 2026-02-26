import { z } from 'zod'
import { timestampSchema } from './entities'

const exportedLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().nullable(),
})

const kombusePluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  kombuse: z.object({
    plugin_system_version: z.literal('kombuse-plugin-v1'),
    exported_at: z.string().min(1),
    labels: z.array(exportedLabelSchema),
  }),
})

export const pluginSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().nullable(),
  directory: z.string().min(1),
  manifest: kombusePluginManifestSchema,
  is_enabled: z.boolean(),
  installed_at: timestampSchema,
  updated_at: timestampSchema,
})

export const availablePluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  directory: z.string().min(1),
  source: z.enum(['project', 'global', 'filesystem', 'github', 'http']),
  source_feed_id: z.string().optional(),
  installed: z.boolean(),
  installed_version: z.string().optional(),
  has_update: z.boolean().optional(),
  latest_version: z.string().optional(),
})

export const pluginUpdateCheckResultSchema = z.object({
  plugin_id: z.string().min(1),
  plugin_name: z.string().min(1),
  has_update: z.boolean(),
  current_version: z.string().min(1),
  latest_version: z.string().optional(),
  feed_id: z.string().optional(),
})

export const pluginRemoteInstallSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  project_id: z.string().min(1),
  overwrite: z.boolean().optional(),
})

export const pluginPublishInputSchema = z.object({
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

export const pluginFileSchema = z.object({
  id: z.number().int().positive(),
  plugin_id: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
  content_hash: z.string().min(1),
  is_user_modified: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export type PluginEntity = z.infer<typeof pluginSchema>
export type AvailablePluginEntity = z.infer<typeof availablePluginSchema>
