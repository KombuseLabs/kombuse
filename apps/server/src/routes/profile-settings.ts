import type { FastifyInstance } from 'fastify'
import { profileSettingsRepository } from '@kombuse/persistence'
import { upsertProfileSettingSchema } from '../schemas/profile-settings'

export async function profileSettingsRoutes(fastify: FastifyInstance) {
  // List all settings for a profile
  fastify.get<{
    Params: { profileId: string }
  }>('/profiles/:profileId/settings', async (request) => {
    return profileSettingsRepository.getByProfile(request.params.profileId)
  })

  // Get a single profile setting by key
  fastify.get<{
    Params: { profileId: string; key: string }
  }>('/profiles/:profileId/settings/:key', async (request, reply) => {
    const setting = profileSettingsRepository.get(
      request.params.profileId,
      request.params.key
    )
    if (!setting) {
      return reply.status(404).send({ error: 'Setting not found' })
    }
    return setting
  })

  // Create or update a profile setting
  fastify.put('/profile-settings', async (request, reply) => {
    const parseResult = upsertProfileSettingSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const setting = profileSettingsRepository.upsert(parseResult.data)
    return setting
  })

  // Delete a profile setting
  fastify.delete<{
    Params: { profileId: string; key: string }
  }>('/profiles/:profileId/settings/:key', async (request, reply) => {
    const deleted = profileSettingsRepository.delete(
      request.params.profileId,
      request.params.key
    )
    if (!deleted) {
      return reply.status(404).send({ error: 'Setting not found' })
    }
    return reply.status(204).send()
  })
}
