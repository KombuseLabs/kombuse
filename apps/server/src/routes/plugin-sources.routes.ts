import type { FastifyInstance } from 'fastify'
import { projectService, resolvePluginConfig } from '@kombuse/services'
import { loadKombuseConfig, loadProjectConfig, saveProjectConfig, getEffectiveProjectPath } from '@kombuse/persistence'
import {
  pluginSourcesQuerySchema,
  putPluginSourcesBodySchema,
} from '../schemas/plugin-sources.schema'

function buildDefaultSources(projectId: string) {
  const { projectPluginsDir, globalPluginsDir } = resolvePluginConfig(projectId)
  return [
    ...(projectPluginsDir ? [{ type: 'filesystem' as const, path: projectPluginsDir, label: 'Project plugins' }] : []),
    { type: 'filesystem' as const, path: globalPluginsDir, label: 'Global plugins' },
    { type: 'http' as const, base_url: 'https://kombuse.dev', label: 'Kombuse Registry' },
  ]
}

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
    const projectConfig = loadProjectConfig(getEffectiveProjectPath(project))

    return {
      global_sources: globalConfig.plugins?.sources ?? [],
      project_sources: projectConfig.plugins?.sources ?? [],
      default_sources: buildDefaultSources(project_id),
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

    const effectivePath = getEffectiveProjectPath(project)

    const existingConfig = loadProjectConfig(effectivePath)
    const updatedConfig = {
      ...existingConfig,
      plugins: {
        ...existingConfig.plugins,
        sources,
      },
    }

    try {
      saveProjectConfig(effectivePath, updatedConfig)
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
    return {
      global_sources: globalConfig.plugins?.sources ?? [],
      project_sources: sources,
      default_sources: buildDefaultSources(project_id),
    }
  })
}
