import type { FastifyInstance } from 'fastify'
import { pluginExportService, PackageExistsError } from '@kombuse/services'
import { pluginExportSchema } from '../schemas/plugins'

export async function pluginRoutes(fastify: FastifyInstance) {
  fastify.post('/plugins/export', async (request, reply) => {
    const parseResult = pluginExportSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const result = pluginExportService.exportPackage(parseResult.data)
      return result
    } catch (error) {
      if (error instanceof PackageExistsError) {
        return reply.status(409).send({
          error: 'package_exists',
          directory: error.directory,
        })
      }

      const message = (error as Error).message
      if (
        message.includes('EACCES') ||
        message.includes('EPERM') ||
        message.includes('EROFS')
      ) {
        return reply.status(403).send({
          error: `Cannot write to directory: ${message}`,
        })
      }
      throw error
    }
  })
}
