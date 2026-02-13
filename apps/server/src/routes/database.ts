import type { FastifyInstance } from 'fastify'
import { listDatabaseTables, queryDatabaseReadOnly } from '@kombuse/persistence'
import { databaseQuerySchema } from '../schemas/database'

export async function databaseRoutes(fastify: FastifyInstance) {
  fastify.get('/database/tables', async () => {
    return { tables: listDatabaseTables() }
  })

  fastify.post('/database/query', async (request, reply) => {
    const parseResult = databaseQuerySchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { sql, params, limit } = parseResult.data
      return queryDatabaseReadOnly(sql, params, limit)
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message })
    }
  })
}
