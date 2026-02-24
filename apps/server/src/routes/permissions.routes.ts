import type { FastifyInstance } from 'fastify'
import { sessionEventsRepository } from '@kombuse/persistence'
import { permissionLogFiltersSchema } from '../schemas/permissions.schema'

export async function permissionRoutes(fastify: FastifyInstance) {
  // List permission log entries for a project
  fastify.get<{
    Params: { projectId: string }
  }>('/projects/:projectId/permissions', async (request, reply) => {
    const parseResult = permissionLogFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return sessionEventsRepository.listPermissions({
      project_id: request.params.projectId,
      ...parseResult.data,
    })
  })
}
