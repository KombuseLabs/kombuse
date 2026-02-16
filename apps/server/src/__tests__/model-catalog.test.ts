import { describe, it, expect } from 'vitest'
import { BACKEND_TYPES } from '@kombuse/types'
import { getModelCatalog } from '../services/model-catalog'

describe('model-catalog', () => {
  describe('getModelCatalog', () => {
    it('returns non-empty model list for codex backend', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CODEX)
      expect(catalog.backend_type).toBe('codex')
      expect(catalog.supports_model_selection).toBe(true)
      expect(catalog.models.length).toBeGreaterThan(0)
      expect(catalog.default_model_id).toBeDefined()
    })

    it('returns empty model list for claude-code backend', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CLAUDE_CODE)
      expect(catalog.backend_type).toBe('claude-code')
      expect(catalog.supports_model_selection).toBe(false)
      expect(catalog.models).toEqual([])
      expect(catalog.default_model_id).toBeUndefined()
    })

    it('returns empty model list for mock backend', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.MOCK)
      expect(catalog.backend_type).toBe('mock')
      expect(catalog.supports_model_selection).toBe(false)
      expect(catalog.models).toEqual([])
    })

    it('codex models have required fields', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CODEX)
      for (const model of catalog.models) {
        expect(model.id).toBeTruthy()
        expect(model.name).toBeTruthy()
      }
    })

    it('codex default model exists in catalog', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CODEX)
      const defaultExists = catalog.models.some(
        (m) => m.id === catalog.default_model_id
      )
      expect(defaultExists).toBe(true)
    })

    it('codex models have provider field', () => {
      const catalog = getModelCatalog(BACKEND_TYPES.CODEX)
      for (const model of catalog.models) {
        expect(model.provider, `model ${model.id} should have a provider`).toBeTruthy()
      }
    })
  })
})
