import type { FastifyInstance } from 'fastify'
import { BACKEND_TYPES, type ModelOption } from '@kombuse/types'
import { CodexBackend } from '@kombuse/agent'
import { createAppLogger } from '@kombuse/core/logger'
import { getModelCatalog, getModelCatalogDynamic, readBinaryPath } from '@kombuse/services'
import { modelCatalogQuerySchema } from '../schemas/models.schema'

const logger = createAppLogger('models-routes')

const CACHE_TTL_MS = 5 * 60 * 1000

export function inferModelProvider(modelId: string): string {
  if (modelId.startsWith('claude-')) return 'Anthropic'
  return 'OpenAI'
}

const modelCache = new Map<string, { models: ModelOption[]; fetchedAt: number }>()

async function fetchCodexModels(): Promise<ModelOption[]> {
  const cached = modelCache.get(BACKEND_TYPES.CODEX)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    logger.debug('Codex models cache hit')
    return cached.models
  }

  const cliPath = readBinaryPath('codex')
  logger.info('Fetching Codex models', { cliPath: cliPath ?? 'default' })
  const backend = new CodexBackend(cliPath ? { cliPath } : {})
  try {
    await backend.spawnAndInitialize(process.cwd())
    const result = await backend.listModels()

    const models: ModelOption[] = result.data.map((m) => ({
      id: m.id,
      name: m.displayName || m.model || m.id,
      provider: inferModelProvider(m.id),
      displayName: m.displayName,
      isDefault: m.isDefault,
      inputModalities: m.inputModalities,
    }))

    modelCache.set(BACKEND_TYPES.CODEX, { models, fetchedAt: Date.now() })
    logger.info('Codex models fetched', { count: models.length })
    return models
  } catch (error) {
    logger.warn('Codex model fetch failed', {
      error: error instanceof Error ? error.message : String(error),
      cliPath: cliPath ?? 'default',
    })
    throw error
  } finally {
    await backend.stop().catch(() => {})
  }
}

export async function modelRoutes(fastify: FastifyInstance) {
  fastify.get('/models', async (request, reply) => {
    const parseResult = modelCatalogQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const { backend_type } = parseResult.data

    if (backend_type === BACKEND_TYPES.CODEX) {
      return getModelCatalogDynamic(backend_type, fetchCodexModels)
    }

    return getModelCatalog(backend_type)
  })
}
