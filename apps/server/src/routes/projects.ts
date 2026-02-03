import type { FastifyInstance } from 'fastify'
import { projectService } from '@kombuse/services'
import {
  createProjectSchema,
  updateProjectSchema,
  projectFiltersSchema,
} from '../schemas/projects'

export async function projectRoutes(fastify: FastifyInstance) {
  // List projects with optional filters
  fastify.get('/projects', async (request, reply) => {
    const parseResult = projectFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return projectService.list(parseResult.data)
  })

  // Get single project
  fastify.get<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const project = projectService.get(request.params.id)
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
    return reply.status(201).send(project)
  })

  // Update project
  fastify.patch<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const parseResult = updateProjectSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const project = projectService.update(request.params.id, parseResult.data)
      return project
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Project not found' })
      }
      throw error
    }
  })

  // Delete project
  fastify.delete<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    try {
      projectService.delete(request.params.id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Project not found' })
      }
      throw error
    }
  })
}
