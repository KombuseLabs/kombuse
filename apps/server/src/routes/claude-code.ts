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
}
