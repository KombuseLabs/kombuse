import { z } from 'zod'

const filesystemSourceSchema = z.object({
  type: z.literal('filesystem'),
  path: z.string().min(1),
})

const githubSourceSchema = z.object({
  type: z.literal('github'),
  repo: z.string().min(1),
  package_name: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
})

const httpSourceSchema = z.object({
  type: z.literal('http'),
  base_url: z.string().min(1),
  token: z.string().min(1).optional(),
})

export const pluginSourceConfigSchema = z.discriminatedUnion('type', [
  filesystemSourceSchema,
  githubSourceSchema,
  httpSourceSchema,
])

export const pluginSourcesQuerySchema = z.object({
  project_id: z.string().min(1),
})

export const putPluginSourcesBodySchema = z.object({
  project_id: z.string().min(1),
  sources: z.array(pluginSourceConfigSchema),
})

export const pluginSourcesResponseSchema = z.object({
  global_sources: z.array(pluginSourceConfigSchema),
  project_sources: z.array(pluginSourceConfigSchema),
})

export type PluginSourcesQuery = z.infer<typeof pluginSourcesQuerySchema>
export type PutPluginSourcesBody = z.infer<typeof putPluginSourcesBodySchema>
export type PluginSourcesResponse = z.infer<typeof pluginSourcesResponseSchema>
