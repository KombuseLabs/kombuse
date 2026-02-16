import { BACKEND_TYPES, type BackendType, type ModelOption, type ModelCatalogResponse } from '@kombuse/types'
import { getBackendCapability } from './session-preferences-service'

export const CODEX_FALLBACK_MODELS: ModelOption[] = [
  { id: 'o3', name: 'o3', description: 'Latest OpenAI reasoning model', provider: 'OpenAI' },
  { id: 'o4-mini', name: 'o4-mini', description: 'Fast, affordable reasoning model', provider: 'OpenAI' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Flagship GPT model', provider: 'OpenAI' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast, affordable GPT model', provider: 'OpenAI' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Smallest, fastest GPT model', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous flagship multimodal model', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Previous fast, affordable model', provider: 'OpenAI' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Anthropic hybrid reasoning model', provider: 'Anthropic' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', description: 'Anthropic frontier model', provider: 'Anthropic' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic balanced model', provider: 'Anthropic' },
]

const CODEX_DEFAULT_MODEL_ID = 'o3'

const MODEL_CATALOGS: Record<BackendType, { models: ModelOption[]; defaultModelId?: string }> = {
  [BACKEND_TYPES.CODEX]: {
    models: CODEX_FALLBACK_MODELS,
    defaultModelId: CODEX_DEFAULT_MODEL_ID,
  },
  [BACKEND_TYPES.CLAUDE_CODE]: {
    models: [],
    defaultModelId: undefined,
  },
  [BACKEND_TYPES.MOCK]: {
    models: [],
    defaultModelId: undefined,
  },
}

export function getModelCatalog(backendType: BackendType): ModelCatalogResponse {
  const catalog = MODEL_CATALOGS[backendType]
  const capability = getBackendCapability(backendType)

  return {
    backend_type: backendType,
    supports_model_selection: capability.supportsModelSelection,
    models: catalog.models,
    default_model_id: catalog.defaultModelId,
  }
}

export async function getModelCatalogDynamic(
  backendType: BackendType,
  fetchModels?: () => Promise<ModelOption[]>
): Promise<ModelCatalogResponse> {
  if (!fetchModels || backendType !== BACKEND_TYPES.CODEX) {
    return getModelCatalog(backendType)
  }

  try {
    const models = await fetchModels()
    const defaultModel = models.find((m) => m.isDefault)
    return {
      backend_type: backendType,
      supports_model_selection: true,
      models,
      default_model_id: defaultModel?.id ?? models[0]?.id,
    }
  } catch {
    return getModelCatalog(backendType)
  }
}
