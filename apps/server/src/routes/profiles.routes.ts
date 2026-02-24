import type { FastifyInstance } from 'fastify'
import { profileService } from '@kombuse/services'
import {
  createProfileSchema,
  updateProfileSchema,
  profileFiltersSchema,
} from '../schemas/profiles.schema'

export async function profileRoutes(fastify: FastifyInstance) {
  // List profiles with optional filters
  fastify.get('/profiles', async (request, reply) => {
    const parseResult = profileFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return profileService.list(parseResult.data)
  })

  // Get single profile
  fastify.get<{
    Params: { id: string }
  }>('/profiles/:id', async (request, reply) => {
    const profile = profileService.get(request.params.id)
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' })
    }
    return profile
  })

  // Create profile
  fastify.post('/profiles', async (request, reply) => {
    const parseResult = createProfileSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const profile = profileService.create(parseResult.data)
    return reply.status(201).send(profile)
  })

  // Update profile
  fastify.patch<{
    Params: { id: string }
  }>('/profiles/:id', async (request, reply) => {
    const parseResult = updateProfileSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const profile = profileService.update(request.params.id, parseResult.data)
      return profile
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Profile not found' })
      }
      throw error
    }
  })

  // Delete profile (soft delete)
  fastify.delete<{
    Params: { id: string }
  }>('/profiles/:id', async (request, reply) => {
    try {
      profileService.delete(request.params.id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Profile not found' })
      }
      throw error
    }
  })
}
