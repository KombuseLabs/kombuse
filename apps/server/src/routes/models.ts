import type { FastifyInstance } from 'fastify'
import { modelCatalogQuerySchema } from '../schemas/models'
import { getModelCatalog } from '../services/model-catalog'

export async function modelRoutes(fastify: FastifyInstance) {
  fastify.get('/models', async (request, reply) => {
    const parseResult = modelCatalogQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return getModelCatalog(parseResult.data.backend_type)
  })
}
