import type { FastifyInstance } from 'fastify'
import { sessionsRepository } from '@kombuse/persistence'
import { sessionsPerDayQuerySchema } from '../schemas/analytics'

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/analytics/sessions-per-day', async (request, reply) => {
    const parseResult = sessionsPerDayQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { project_id, days } = parseResult.data
    return sessionsRepository.sessionsPerDay(project_id, days)
  })
}
