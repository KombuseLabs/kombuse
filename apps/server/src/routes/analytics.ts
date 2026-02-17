import type { FastifyInstance } from 'fastify'
import { analyticsService } from '@kombuse/services'
import { sessionsPerDayQuerySchema } from '../schemas/analytics'

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/analytics/sessions-per-day', async (request, reply) => {
    const parseResult = sessionsPerDayQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.sessionsPerDay(project_id, days)
    } catch (error) {
      throw error
    }
  })
}
