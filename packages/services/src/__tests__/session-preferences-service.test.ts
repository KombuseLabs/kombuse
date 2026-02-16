import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BACKEND_TYPES } from '@kombuse/types'

vi.mock('@kombuse/persistence', () => ({
  profileSettingsRepository: {
    get: vi.fn(() => null),
  },
}))

import { profileSettingsRepository } from '@kombuse/persistence'
import {
  normalizeModelPreference,
  readUserDefaultMaxChainDepth,
  readUserBackendIdleTimeoutMinutes,
  resolveBackendType,
  resolveConfiguredBackendType,
  resolveModelPreference,
  AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
  CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
  DEFAULT_PREFERENCE_PROFILE_ID,
} from '../session-preferences-service'

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

    const mockResolved = resolveModelPreference({
      sessionModelPreference: undefined,
      agentModelPreference: 'gpt-5-mini',
      userDefaultModelPreference: undefined,
      backendType: BACKEND_TYPES.MOCK,
    })
    expect(mockResolved.modelPreference).toBe('gpt-5-mini')
    expect(mockResolved.appliedModel).toBeUndefined()
  })
})

describe('readUserDefaultMaxChainDepth', () => {
  const mockGet = profileSettingsRepository.get as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('returns a valid integer within range', () => {
    mockGet.mockReturnValue({ setting_value: '10' })
    expect(readUserDefaultMaxChainDepth()).toBe(10)
  })

  it('returns boundary values (1 and 100)', () => {
    mockGet.mockReturnValue({ setting_value: '1' })
    expect(readUserDefaultMaxChainDepth()).toBe(1)

    mockGet.mockReturnValue({ setting_value: '100' })
    expect(readUserDefaultMaxChainDepth()).toBe(100)
  })

  it('returns undefined when no setting exists', () => {
    mockGet.mockReturnValue(null)
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()
  })

  it('returns undefined when setting_value is empty', () => {
    mockGet.mockReturnValue({ setting_value: '' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()
  })

  it('returns undefined for non-numeric strings', () => {
    mockGet.mockReturnValue({ setting_value: 'abc' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()
  })

  it('returns undefined for out-of-range values', () => {
    mockGet.mockReturnValue({ setting_value: '0' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()

    mockGet.mockReturnValue({ setting_value: '-1' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()

    mockGet.mockReturnValue({ setting_value: '101' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()
  })

  it('returns undefined for float values', () => {
    mockGet.mockReturnValue({ setting_value: '3.5' })
    expect(readUserDefaultMaxChainDepth()).toBeUndefined()
  })

  it('uses default profileId when none provided', () => {
    readUserDefaultMaxChainDepth()
    expect(mockGet).toHaveBeenCalledWith(
      DEFAULT_PREFERENCE_PROFILE_ID,
      AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
    )
  })

  it('uses custom profileId when provided', () => {
    readUserDefaultMaxChainDepth('custom-profile')
    expect(mockGet).toHaveBeenCalledWith(
      'custom-profile',
      AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
    )
  })
})

describe('readUserBackendIdleTimeoutMinutes', () => {
  const mockGet = profileSettingsRepository.get as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('returns a valid positive integer', () => {
    mockGet.mockReturnValue({ setting_value: '45' })
    expect(readUserBackendIdleTimeoutMinutes()).toBe(45)
  })

  it('returns null for empty string (unlimited)', () => {
    mockGet.mockReturnValue({ setting_value: '' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeNull()
  })

  it('returns null for whitespace-only string (unlimited)', () => {
    mockGet.mockReturnValue({ setting_value: '   ' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeNull()
  })

  it('returns undefined when no setting exists', () => {
    mockGet.mockReturnValue(null)
    expect(readUserBackendIdleTimeoutMinutes()).toBeUndefined()
  })

  it('returns undefined for non-numeric strings', () => {
    mockGet.mockReturnValue({ setting_value: 'abc' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeUndefined()
  })

  it('returns undefined for zero', () => {
    mockGet.mockReturnValue({ setting_value: '0' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeUndefined()
  })

  it('returns undefined for negative values', () => {
    mockGet.mockReturnValue({ setting_value: '-5' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeUndefined()
  })

  it('returns undefined for float values', () => {
    mockGet.mockReturnValue({ setting_value: '3.5' })
    expect(readUserBackendIdleTimeoutMinutes()).toBeUndefined()
  })

  it('accepts large values (no max limit)', () => {
    mockGet.mockReturnValue({ setting_value: '99999' })
    expect(readUserBackendIdleTimeoutMinutes()).toBe(99999)
  })

  it('uses default profileId when none provided', () => {
    readUserBackendIdleTimeoutMinutes()
    expect(mockGet).toHaveBeenCalledWith(
      DEFAULT_PREFERENCE_PROFILE_ID,
      CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
    )
  })

  it('uses custom profileId when provided', () => {
    readUserBackendIdleTimeoutMinutes('custom-profile')
    expect(mockGet).toHaveBeenCalledWith(
      'custom-profile',
      CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
    )
  })
})
