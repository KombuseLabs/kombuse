import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCodexMcpStatus, setCodexMcpEnabled } from '../services/codex-mcp-config'
import { stopActiveCodexBackends } from '../services/agent-execution-service'

const setCodexMcpSchema = z.object({
  enabled: z.boolean(),
})

export async function codexMcpRoutes(fastify: FastifyInstance) {
  fastify.get('/codex/mcp', async (_request, reply) => {
    try {
      return getCodexMcpStatus()
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  fastify.put('/codex/mcp', async (request, reply) => {
    const parseResult = setCodexMcpSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const status = setCodexMcpEnabled(parseResult.data.enabled)
      const stopped_sessions = stopActiveCodexBackends()
      return { ...status, stopped_sessions }
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
