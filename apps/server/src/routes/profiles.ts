import type { FastifyInstance } from 'fastify'
import { profilesRepository } from '@kombuse/persistence'
import {
  createProfileSchema,
  updateProfileSchema,
  profileFiltersSchema,
} from '../schemas/profiles'

export async function profileRoutes(fastify: FastifyInstance) {
  // List profiles with optional filters
  fastify.get('/profiles', async (request, reply) => {
    const parseResult = profileFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return profilesRepository.list(parseResult.data)
  })

  // Get single profile
  fastify.get<{
    Params: { id: string }
  }>('/profiles/:id', async (request, reply) => {
    const profile = profilesRepository.get(request.params.id)
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

    const profile = profilesRepository.create(parseResult.data)
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

    const profile = profilesRepository.update(request.params.id, parseResult.data)
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' })
    }
    return profile
  })

  // Delete profile (soft delete)
  fastify.delete<{
    Params: { id: string }
  }>('/profiles/:id', async (request, reply) => {
    const deleted = profilesRepository.delete(request.params.id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Profile not found' })
    }
    return reply.status(204).send()
  })
}
