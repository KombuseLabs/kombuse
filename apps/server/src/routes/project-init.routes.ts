import type { FastifyInstance } from 'fastify'
import { projectService, initProject } from '@kombuse/services'
import { initProjectBodySchema } from '../schemas/project-init.schema'
import { resolveKombuseBridgeCommandConfig } from '../services/codex-mcp-config'

export async function projectInitRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string }
  }>('/projects/:id/init', async (request, reply) => {
    const project = projectService.getByIdOrSlug(request.params.id)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    if (!project.local_path) {
      return reply.status(400).send({ error: 'Project has no local_path configured' })
    }

    const parseResult = initProjectBodySchema.safeParse(request.body ?? {})
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const bridgeConfig = resolveKombuseBridgeCommandConfig()

    const result = initProject(project.local_path, {
      ...parseResult.data,
      mcpBridgeConfig: bridgeConfig,
    })

    return result
  })
}
