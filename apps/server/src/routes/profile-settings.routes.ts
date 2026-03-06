import type { FastifyInstance } from 'fastify'
import { profileSettingsRepository } from '@kombuse/persistence'
import { CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY, FILE_LOGGING_ENABLED_SETTING_KEY } from '@kombuse/services'
import { setLogTarget } from '../logger'
import { upsertProfileSettingSchema } from '../schemas/profile-settings.schema'
import { rescheduleAllIdleTimeouts } from '../services/agent-execution-service'

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
  }>('/profiles/:profileId/settings/:key', async (request) => {
    return profileSettingsRepository.get(
      request.params.profileId,
      request.params.key
    )
  })

  // Create or update a profile setting
  fastify.put('/profile-settings', async (request, reply) => {
    const parseResult = upsertProfileSettingSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const setting = profileSettingsRepository.upsert(parseResult.data)

    if (parseResult.data.setting_key === CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY) {
      rescheduleAllIdleTimeouts()
    }

    if (parseResult.data.setting_key === FILE_LOGGING_ENABLED_SETTING_KEY) {
      if (!process.env.KOMBUSE_LOG_TARGET) {
        setLogTarget(parseResult.data.setting_value === 'true' ? 'file' : 'console')
      }
    }

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

    if (request.params.key === CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY) {
      rescheduleAllIdleTimeouts()
    }

    if (request.params.key === FILE_LOGGING_ENABLED_SETTING_KEY) {
      if (!process.env.KOMBUSE_LOG_TARGET) {
        setLogTarget('console')
      }
    }

    return reply.status(204).send()
  })
}
