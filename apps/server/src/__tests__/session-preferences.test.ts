import { describe, it, expect } from 'vitest'
import { BACKEND_TYPES } from '@kombuse/types'
import {
  normalizeModelPreference,
  resolveBackendType,
  resolveConfiguredBackendType,
  resolveModelPreference,
} from '../services/session-preferences'

describe('session-preferences backend resolution', () => {
  it('resolves backend in session -> agent -> user -> fallback order', () => {
    expect(resolveBackendType({
      sessionBackendType: BACKEND_TYPES.CODEX,
      agentBackendType: BACKEND_TYPES.CLAUDE_CODE,
      userDefaultBackendType: BACKEND_TYPES.CLAUDE_CODE,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })).toBe(BACKEND_TYPES.CODEX)

    expect(resolveBackendType({
      sessionBackendType: undefined,
      agentBackendType: BACKEND_TYPES.CODEX,
      userDefaultBackendType: BACKEND_TYPES.CLAUDE_CODE,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })).toBe(BACKEND_TYPES.CODEX)

    expect(resolveBackendType({
      sessionBackendType: undefined,
      agentBackendType: undefined,
      userDefaultBackendType: BACKEND_TYPES.CODEX,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })).toBe(BACKEND_TYPES.CODEX)

    expect(resolveBackendType({
      sessionBackendType: undefined,
      agentBackendType: undefined,
      userDefaultBackendType: undefined,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })).toBe(BACKEND_TYPES.CLAUDE_CODE)
  })

  it('ignores invalid backend values', () => {
    expect(resolveConfiguredBackendType('invalid-backend')).toBeUndefined()
    expect(resolveBackendType({
      sessionBackendType: 'invalid',
      agentBackendType: null,
      userDefaultBackendType: 123,
      fallbackBackendType: BACKEND_TYPES.CLAUDE_CODE,
    })).toBe(BACKEND_TYPES.CLAUDE_CODE)
  })
})

describe('session-preferences model resolution', () => {
  it('normalizes model preferences', () => {
    expect(normalizeModelPreference('  gpt-5  ')).toBe('gpt-5')
    expect(normalizeModelPreference('   ')).toBeUndefined()
    expect(normalizeModelPreference(undefined)).toBeUndefined()
  })

  it('resolves model preference in session -> agent -> user order', () => {
    const resolved = resolveModelPreference({
      sessionModelPreference: 'session-model',
      agentModelPreference: 'agent-model',
      userDefaultModelPreference: 'global-model',
      backendType: BACKEND_TYPES.CODEX,
    })

    expect(resolved.modelPreference).toBe('session-model')
  })

  it('only applies model when backend supports model selection', () => {
    const codexResolved = resolveModelPreference({
      sessionModelPreference: undefined,
      agentModelPreference: 'gpt-5-mini',
      userDefaultModelPreference: undefined,
      backendType: BACKEND_TYPES.CODEX,
    })
    expect(codexResolved.appliedModel).toBe('gpt-5-mini')

    const claudeResolved = resolveModelPreference({
      sessionModelPreference: undefined,
      agentModelPreference: 'gpt-5-mini',
      userDefaultModelPreference: undefined,
      backendType: BACKEND_TYPES.CLAUDE_CODE,
    })
    expect(claudeResolved.modelPreference).toBe('gpt-5-mini')
    expect(claudeResolved.appliedModel).toBeUndefined()
  })
})
