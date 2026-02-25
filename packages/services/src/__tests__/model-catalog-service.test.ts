import { describe, it, expect } from 'vitest'
import { BACKEND_TYPES } from '@kombuse/types'
import { getModelCatalog, getModelCatalogDynamic, CODEX_FALLBACK_MODELS, CLAUDE_CODE_MODELS } from '../model-catalog-service'

describe('model-catalog', () => {
  describe('getModelCatalog', () => {
    it('returns non-empty model list for claude-code backend', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CLAUDE_CODE)
      expect(catalog.backend_type).toBe('claude-code')
      expect(catalog.supports_model_selection).toBe(true)
      expect(catalog.models.length).toBeGreaterThan(0)
      expect(catalog.default_model_id).toBeDefined()
    })

    it('claude-code models have required fields', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CLAUDE_CODE)
      for (const model of catalog.models) {
        expect(model.id).toBeTruthy()
        expect(model.name).toBeTruthy()
        expect(model.provider).toBe('Anthropic')
      }
    })

    it('claude-code default model exists in catalog', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CLAUDE_CODE)
      const defaultExists = catalog.models.some(
        (m) => m.id === catalog.default_model_id
      )
      expect(defaultExists).toBe(true)
    })

    it('returns empty model list for mock backend', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.MOCK)
      expect(catalog.backend_type).toBe('mock')
      expect(catalog.supports_model_selection).toBe(false)
      expect(catalog.models).toEqual([])
    })

  })

  describe('getModelCatalogDynamic', () => {
    it('returns dynamic models when fetcher succeeds', async () => {
      const dynamicModels = [
        { id: 'dynamic-1', name: 'Dynamic Model 1', provider: 'TestProvider', isDefault: true },
        { id: 'dynamic-2', name: 'Dynamic Model 2', provider: 'TestProvider' },
      ]
      const fetcher = async () => dynamicModels

      const catalog = await getModelCatalogDynamic(BACKEND_TYPES.CODEX, fetcher)
      expect(catalog.backend_type).toBe('codex')
      expect(catalog.supports_model_selection).toBe(true)
      expect(catalog.models).toEqual(dynamicModels)
      expect(catalog.default_model_id).toBe('dynamic-1')
    })

    it('falls back to static catalog when fetcher fails', async () => {
      const fetcher = async () => { throw new Error('Connection failed') }

      const catalog = await getModelCatalogDynamic(BACKEND_TYPES.CODEX, fetcher)
      expect(catalog.backend_type).toBe('codex')
      expect(catalog.supports_model_selection).toBe(true)
      expect(catalog.models).toEqual(CODEX_FALLBACK_MODELS)
      expect(catalog.default_model_id).toBeUndefined()
    })

    it('returns static catalog when no fetcher provided', async () => {
      const catalog = await getModelCatalogDynamic(BACKEND_TYPES.CODEX)
      expect(catalog.backend_type).toBe('codex')
      expect(catalog.models).toEqual(CODEX_FALLBACK_MODELS)
    })

    it('returns static catalog for non-codex backend even with fetcher', async () => {
      const fetcher = async () => [{ id: 'test', name: 'Test' }]

      const catalog = await getModelCatalogDynamic(BACKEND_TYPES.CLAUDE_CODE, fetcher)
      expect(catalog.backend_type).toBe('claude-code')
      expect(catalog.supports_model_selection).toBe(true)
      expect(catalog.models).toEqual(CLAUDE_CODE_MODELS)
    })

    it('uses first model as default when no isDefault flag set', async () => {
      const dynamicModels = [
        { id: 'model-a', name: 'Model A', provider: 'Test' },
        { id: 'model-b', name: 'Model B', provider: 'Test' },
      ]
      const fetcher = async () => dynamicModels

      const catalog = await getModelCatalogDynamic(BACKEND_TYPES.CODEX, fetcher)
      expect(catalog.default_model_id).toBe('model-a')
    })
  })
})
