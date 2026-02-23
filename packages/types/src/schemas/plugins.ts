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
    project_id: z.string().min(1),
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
  source: z.enum(['project', 'global']),
  installed: z.boolean(),
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
