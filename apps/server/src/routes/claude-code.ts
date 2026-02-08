import type { FastifyInstance } from 'fastify'
import { basename } from 'node:path'
import { claudeCodeScanner, projectService } from '@kombuse/services'
import { importClaudeCodeProjectsSchema } from '../schemas/claude-code'

export async function claudeCodeRoutes(fastify: FastifyInstance) {
  /**
   * GET /claude-code/projects
   * Scan ~/.claude/projects/ and return discovered projects with import status
   */
  fastify.get('/claude-code/projects', async () => {
    const discovered = claudeCodeScanner.scan()

    // Get all existing projects to check which paths are already imported
    const existing = projectService.list({ limit: 10000 })
    const importedPaths = new Set(
      existing.map((p) => p.local_path).filter(Boolean)
    )

    return discovered.map((project) => ({
      ...project,
      isImported: importedPaths.has(project.path),
    }))
  })

  /**
   * POST /claude-code/projects/import
   * Import selected Claude Code projects into the database
   */
  fastify.post('/claude-code/projects/import', async (request, reply) => {
    const parseResult = importClaudeCodeProjectsSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { paths } = parseResult.data

    // Get existing projects to skip already-imported ones
    const existing = projectService.list({ limit: 10000 })
    const importedPaths = new Set(
      existing.map((p) => p.local_path).filter(Boolean)
    )

    const created = []
    for (const path of paths) {
      if (importedPaths.has(path)) continue

      const project = projectService.create({
        name: basename(path),
        owner_id: 'user-1',
        local_path: path,
      })
      created.push(project)
    }

    return reply.status(201).send(created)
  })

  /**
   * GET /claude-code/sessions
   * List sessions for a Claude Code project by its filesystem path
   */
  fastify.get<{ Querystring: { path: string } }>(
    '/claude-code/sessions',
    async (request, reply) => {
      const { path } = request.query
      if (!path) {
        return reply.status(400).send({ error: 'Missing required query param: path' })
      }

      try {
        const sessions = claudeCodeScanner.listSessions(path)
        return { sessions }
      } catch (error) {
        return reply.status(500).send({ error: (error as Error).message })
      }
    }
  )

  /**
   * GET /claude-code/sessions/:sessionId
   * Get raw JSONL content for a Claude Code session
   */
  fastify.get<{ Params: { sessionId: string }; Querystring: { path: string } }>(
    '/claude-code/sessions/:sessionId',
    async (request, reply) => {
      const { path } = request.query
      const { sessionId } = request.params

      if (!path) {
        return reply.status(400).send({ error: 'Missing required query param: path' })
      }

      try {
        const items = claudeCodeScanner.getSessionContent(path, sessionId)
        return { items, count: items.length }
      } catch (error) {
        const message = (error as Error).message
        if (message.includes('not found')) {
          return reply.status(404).send({ error: message })
        }
        return reply.status(500).send({ error: message })
      }
    }
  )
}
