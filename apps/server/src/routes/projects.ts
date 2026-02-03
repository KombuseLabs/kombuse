import type { FastifyInstance } from 'fastify'
import { projectsRepository } from '@kombuse/persistence'
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

    return projectsRepository.list(parseResult.data)
  })

  // Get single project
  fastify.get<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const project = projectsRepository.get(request.params.id)
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

    const project = projectsRepository.create(parseResult.data)
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

    const project = projectsRepository.update(request.params.id, parseResult.data)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }
    return project
  })

  // Delete project
  fastify.delete<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    const deleted = projectsRepository.delete(request.params.id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Project not found' })
    }
    return reply.status(204).send()
  })
}
