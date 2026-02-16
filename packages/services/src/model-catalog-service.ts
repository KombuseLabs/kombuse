import { BACKEND_TYPES, type BackendType, type ModelOption, type ModelCatalogResponse } from '@kombuse/types'
import { getBackendCapability } from './session-preferences-service'

export const CODEX_FALLBACK_MODELS: ModelOption[] = [
]

export const CLAUDE_CODE_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', isDefault: true },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic', isDefault: false },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic', isDefault: false },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic', isDefault: false },
  { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', provider: 'Anthropic', isDefault: false },
]

const CLAUDE_CODE_DEFAULT_MODEL_ID = 'claude-opus-4-6'

const MODEL_CATALOGS: Record<BackendType, { models: ModelOption[]; defaultModelId?: string }> = {
  [BACKEND_TYPES.CODEX]: {
    models: CODEX_FALLBACK_MODELS,
    defaultModelId: undefined,
  },
  [BACKEND_TYPES.CLAUDE_CODE]: {
    models: CLAUDE_CODE_MODELS,
    defaultModelId: CLAUDE_CODE_DEFAULT_MODEL_ID,
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
