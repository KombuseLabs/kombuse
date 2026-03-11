import { createAppLogger } from '@kombuse/core/logger'
import type { FastifyInstance } from 'fastify'
import { projectService, initProject } from '@kombuse/services'
import {
  createProjectSchema,
  updateProjectSchema,
  projectFiltersSchema,
} from '../schemas/projects.schema'
import {
  ensureCodexProjectTrust,
  initializeProjectCodexConfig,
  resolveKombuseBridgeCommandConfig,
} from '../services/codex-mcp-config'

const log = createAppLogger('ProjectRoutes')

function configureCodexForProject(localPath: string | null | undefined): { success: boolean; error?: string } {
  if (!localPath) {
    return { success: true }
  }
  try {
    ensureCodexProjectTrust(localPath)
    initializeProjectCodexConfig(localPath)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn(
      `Failed to configure Codex for project path: ${localPath}`,
      { error: message }
    )
    return { success: false, error: message }
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
    const codexResult = configureCodexForProject(project.local_path)
    if (!codexResult.success) {
      return reply.status(201).send({ ...project, warning: `Codex configuration failed: ${codexResult.error}` })
    }

    if (project.local_path) {
      try {
        const bridgeConfig = resolveKombuseBridgeCommandConfig()
        initProject(project.local_path, { mcpBridgeConfig: bridgeConfig })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('Failed to initialize project files', { error: message })
        return reply.status(201).send({ ...project, warning: `Project init failed: ${message}` })
      }
    }

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
        const codexResult = configureCodexForProject(project.local_path)
        if (!codexResult.success) {
          return { ...project, warning: `Codex configuration failed: ${codexResult.error}` }
        }
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
