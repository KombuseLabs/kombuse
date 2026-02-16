import type { FastifyInstance } from 'fastify'
import { BACKEND_TYPES, type ModelOption } from '@kombuse/types'
import { CodexBackend } from '@kombuse/agent'
import { getModelCatalog, getModelCatalogDynamic } from '@kombuse/services'
import { modelCatalogQuerySchema } from '../schemas/models'

const CACHE_TTL_MS = 5 * 60 * 1000

export function inferModelProvider(modelId: string): string {
  if (modelId.startsWith('claude-')) return 'Anthropic'
  return 'OpenAI'
}

const modelCache = new Map<string, { models: ModelOption[]; fetchedAt: number }>()

async function fetchCodexModels(): Promise<ModelOption[]> {
  const cached = modelCache.get(BACKEND_TYPES.CODEX)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.models
  }

  const backend = new CodexBackend()
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
    return models
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
