import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getClaudeCodeMcpStatus, setClaudeCodeMcpEnabled } from '../services/claude-code-mcp-config'
import { stopActiveClaudeCodeBackends } from '../services/agent-execution-service'

const setClaudeCodeMcpSchema = z.object({
  enabled: z.boolean(),
})

export async function claudeCodeMcpRoutes(fastify: FastifyInstance) {
  fastify.get('/claude-code/mcp', async (_request, reply) => {
    try {
      return getClaudeCodeMcpStatus()
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  fastify.put('/claude-code/mcp', async (request, reply) => {
    const parseResult = setClaudeCodeMcpSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const status = setClaudeCodeMcpEnabled(parseResult.data.enabled)
      const stopped_sessions = stopActiveClaudeCodeBackends()
      return { ...status, stopped_sessions }
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
