import type { FastifyInstance } from 'fastify'
import { projectService, resolvePluginConfig } from '@kombuse/services'
import { loadKombuseConfig, loadProjectConfig, saveProjectConfig } from '@kombuse/persistence'
import {
  pluginSourcesQuerySchema,
  putPluginSourcesBodySchema,
} from '../schemas/plugin-sources.schema'

export async function pluginSourceRoutes(fastify: FastifyInstance) {
  fastify.get('/plugin-sources', async (request, reply) => {
    const parseResult = pluginSourcesQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { project_id } = parseResult.data
    const project = projectService.getByIdOrSlug(project_id)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const globalConfig = loadKombuseConfig()
    const projectConfig = project.local_path
      ? loadProjectConfig(project.local_path)
      : {}

    const { projectPluginsDir, globalPluginsDir } = resolvePluginConfig(project_id)

    return {
      global_sources: globalConfig.plugins?.sources ?? [],
      project_sources: projectConfig.plugins?.sources ?? [],
      default_sources: [
        ...(projectPluginsDir ? [{ type: 'filesystem' as const, path: projectPluginsDir, label: 'Project plugins' }] : []),
        { type: 'filesystem' as const, path: globalPluginsDir, label: 'Global plugins' },
        { type: 'http' as const, base_url: 'https://kombuse.dev', label: 'Kombuse Registry' },
      ],
    }
  })

  fastify.put('/plugin-sources', async (request, reply) => {
    const parseResult = putPluginSourcesBodySchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { project_id, sources } = parseResult.data
    const project = projectService.getByIdOrSlug(project_id)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    if (!project.local_path) {
      return reply.status(400).send({
        error: 'Project has no local_path configured. Cannot save plugin sources.',
      })
    }

    const existingConfig = loadProjectConfig(project.local_path)
    const updatedConfig = {
      ...existingConfig,
      plugins: {
        ...existingConfig.plugins,
        sources,
      },
    }

    try {
      saveProjectConfig(project.local_path, updatedConfig)
    } catch (error) {
      const message = (error as Error).message
      if (
        message.includes('EACCES') ||
        message.includes('EPERM') ||
        message.includes('EROFS')
      ) {
        return reply.status(403).send({
          error: `Cannot write to project config: ${message}`,
        })
      }
      throw error
    }

    const globalConfig = loadKombuseConfig()
    const { projectPluginsDir, globalPluginsDir } = resolvePluginConfig(project_id)
    return {
      global_sources: globalConfig.plugins?.sources ?? [],
      project_sources: sources,
      default_sources: [
        ...(projectPluginsDir ? [{ type: 'filesystem' as const, path: projectPluginsDir, label: 'Project plugins' }] : []),
        { type: 'filesystem' as const, path: globalPluginsDir, label: 'Global plugins' },
        { type: 'http' as const, base_url: 'https://kombuse.dev', label: 'Kombuse Registry' },
      ],
    }
  })
}
