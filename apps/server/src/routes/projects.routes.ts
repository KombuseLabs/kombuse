import type { FastifyInstance } from 'fastify'
import { projectService } from '@kombuse/services'
import {
  createProjectSchema,
  updateProjectSchema,
  projectFiltersSchema,
} from '../schemas/projects.schema'
import {
  ensureCodexProjectTrust,
  initializeProjectCodexConfig,
} from '../services/codex-mcp-config'

function configureCodexForProject(localPath: string | null | undefined): void {
  if (!localPath) {
    return
  }
  try {
    ensureCodexProjectTrust(localPath)
    initializeProjectCodexConfig(localPath)
  } catch (error) {
    console.warn(
      '[Server] Failed to configure Codex for project path:',
      localPath,
      error instanceof Error ? error.message : error
    )
  }
}

export async function projectRoutes(fastify: FastifyInstance) {
  // List projects with optional filters
  fastify.get('/projects', async (request, reply) => {
    const parseResult = projectFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return projectService.list(parseResult.data)
  })

  // Get single project (resolves by UUID or slug)
  fastify.get<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const project = projectService.getByIdOrSlug(request.params.id)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }
    return project
  })

  // Create project
  fastify.post('/projects', async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const project = projectService.create(parseResult.data)
    configureCodexForProject(project.local_path)
    return reply.status(201).send(project)
  })

  // Update project (resolves by UUID or slug)
  fastify.patch<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const parseResult = updateProjectSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const existing = projectService.getByIdOrSlug(request.params.id)
    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    try {
      const project = projectService.update(existing.id, parseResult.data)
      if (parseResult.data.local_path !== undefined) {
        configureCodexForProject(project.local_path)
      }
      return project
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Project not found' })
      }
      throw error
    }
  })

  // Delete project (resolves by UUID or slug)
  fastify.delete<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const existing = projectService.getByIdOrSlug(request.params.id)
    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    try {
      projectService.delete(existing.id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Project not found' })
      }
      throw error
    }
  })
}
