import type { FastifyInstance } from 'fastify'
import {
  checkAllBackendStatuses,
  refreshBackendStatuses,
} from '../services/backend-status'

export async function backendStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/backend-status', async () => {
    return checkAllBackendStatuses()
  })

  fastify.post('/backend-status/refresh', async () => {
    return refreshBackendStatuses()
  })
}
