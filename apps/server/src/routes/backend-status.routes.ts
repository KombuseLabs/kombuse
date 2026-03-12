import type { FastifyInstance } from 'fastify'
import {
  checkAllBackendStatuses,
  refreshBackendStatuses,
} from '../services/backend-status'

export async function backendStatusRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { projectId?: string } }>('/backend-status', async (request) => {
    const { projectId } = request.query
    return checkAllBackendStatuses(projectId)
  })

  fastify.post('/backend-status/refresh', async () => {
    return refreshBackendStatuses()
  })
}
