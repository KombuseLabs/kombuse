import type { FastifyInstance } from 'fastify'
import { milestoneService } from '@kombuse/services'
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  milestoneFiltersSchema,
} from '../schemas/milestones.schema'

export async function milestoneRoutes(fastify: FastifyInstance) {
  // List milestones for a project (with stats)
  fastify.get<{
    Params: { projectId: string }
  }>('/projects/:projectId/milestones', async (request, reply) => {
    const parseResult = milestoneFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return milestoneService.listWithStats({
      project_id: request.params.projectId,
      ...parseResult.data,
    })
  })

  // Get single milestone (with stats)
  fastify.get<{
    Params: { id: string }
  }>('/milestones/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid milestone ID' })
    }

    const milestone = milestoneService.getWithStats(id)
    if (!milestone) {
      return reply.status(404).send({ error: 'Milestone not found' })
    }
    return milestone
  })

  // Create milestone for a project
  fastify.post<{
    Params: { projectId: string }
  }>('/projects/:projectId/milestones', async (request, reply) => {
    const parseResult = createMilestoneSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const milestone = milestoneService.create({
      project_id: request.params.projectId,
      ...parseResult.data,
    })
    return reply.status(201).send(milestone)
  })

  // Update milestone
  fastify.patch<{
    Params: { id: string }
  }>('/milestones/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid milestone ID' })
    }

    const parseResult = updateMilestoneSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const milestone = milestoneService.update(id, parseResult.data)
      return milestone
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Milestone not found' })
      }
      throw error
    }
  })

  // Delete milestone
  fastify.delete<{
    Params: { id: string }
  }>('/milestones/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid milestone ID' })
    }

    try {
      milestoneService.delete(id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Milestone not found' })
      }
      throw error
    }
  })
}
