import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BACKEND_TYPES } from '@kombuse/types'

vi.mock('@kombuse/persistence', () => ({
  profileSettingsRepository: {
    get: vi.fn(() => null),
  },
  loadBinaryPathFromFileConfig: vi.fn(() => undefined),
}))

import { profileSettingsRepository, loadBinaryPathFromFileConfig } from '@kombuse/persistence'
import {
  normalizeModelPreference,
  readBinaryPath,
  readUserDefaultMaxChainDepth,
  readUserBackendIdleTimeoutMinutes,
  readNotificationScope,
  readCrashReportingEnabled,
  resolveBackendType,
  resolveConfiguredBackendType,
  resolveModelPreference,
  AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
  BINARIES_CLAUDE_SETTING_KEY,
  BINARIES_CODEX_SETTING_KEY,
  CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
  CRASH_REPORTING_ENABLED_SETTING_KEY,
  NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY,
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

describe('readNotificationScope', () => {
  const mockGet = profileSettingsRepository.get as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('returns "project" when no setting exists', () => {
    expect(readNotificationScope()).toBe('project')
  })

  it('returns "all" when setting value is "all"', () => {
    mockGet.mockReturnValue({ setting_value: 'all' })
    expect(readNotificationScope()).toBe('all')
  })

  it('returns "project" for unexpected values', () => {
    mockGet.mockReturnValue({ setting_value: 'something-else' })
    expect(readNotificationScope()).toBe('project')
  })

  it('returns "project" when setting value is "project"', () => {
    mockGet.mockReturnValue({ setting_value: 'project' })
    expect(readNotificationScope()).toBe('project')
  })

  it('uses the correct setting key', () => {
    readNotificationScope()
    expect(mockGet).toHaveBeenCalledWith(
      DEFAULT_PREFERENCE_PROFILE_ID,
      NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY,
    )
  })

  it('uses custom profileId when provided', () => {
    readNotificationScope('custom-profile')
    expect(mockGet).toHaveBeenCalledWith(
      'custom-profile',
      NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY,
    )
  })
})

describe('readCrashReportingEnabled', () => {
  const mockGet = profileSettingsRepository.get as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('returns true when no setting exists (default)', () => {
    expect(readCrashReportingEnabled()).toBe(true)
  })

  it('returns true when setting value is "true"', () => {
    mockGet.mockReturnValue({ setting_value: 'true' })
    expect(readCrashReportingEnabled()).toBe(true)
  })

  it('returns false when setting value is "false"', () => {
    mockGet.mockReturnValue({ setting_value: 'false' })
    expect(readCrashReportingEnabled()).toBe(false)
  })

  it('returns true for unexpected values', () => {
    mockGet.mockReturnValue({ setting_value: 'something-else' })
    expect(readCrashReportingEnabled()).toBe(true)
  })

  it('uses the correct setting key', () => {
    readCrashReportingEnabled()
    expect(mockGet).toHaveBeenCalledWith(
      DEFAULT_PREFERENCE_PROFILE_ID,
      CRASH_REPORTING_ENABLED_SETTING_KEY,
    )
  })

  it('uses custom profileId when provided', () => {
    readCrashReportingEnabled('custom-profile')
    expect(mockGet).toHaveBeenCalledWith(
      'custom-profile',
      CRASH_REPORTING_ENABLED_SETTING_KEY,
    )
  })
})

describe('readBinaryPath', () => {
  const mockGet = profileSettingsRepository.get as ReturnType<typeof vi.fn>
  const mockLoadFromFile = loadBinaryPathFromFileConfig as ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
    mockLoadFromFile.mockReset()
    mockLoadFromFile.mockReturnValue(undefined)
  })

  it('returns per-project value when it exists', () => {
    mockGet.mockImplementation((_profileId: string, key: string) => {
      if (key === `${BINARIES_CLAUDE_SETTING_KEY}.project-123`) {
        return { setting_value: '/project/claude' }
      }
      if (key === BINARIES_CLAUDE_SETTING_KEY) {
        return { setting_value: '/global/claude' }
      }
      return null
    })
    mockLoadFromFile.mockReturnValue('/file/claude')

    expect(readBinaryPath('claude', 'project-123')).toBe('/project/claude')
  })

  it('falls back to global when per-project is not set', () => {
    mockGet.mockImplementation((_profileId: string, key: string) => {
      if (key === BINARIES_CLAUDE_SETTING_KEY) {
        return { setting_value: '/global/claude' }
      }
      return null
    })
    mockLoadFromFile.mockReturnValue('/file/claude')

    expect(readBinaryPath('claude', 'project-123')).toBe('/global/claude')
  })

  it('falls back to file config when no DB settings exist', () => {
    mockLoadFromFile.mockReturnValue('/file/codex')

    expect(readBinaryPath('codex', 'project-123')).toBe('/file/codex')
  })

  it('returns undefined when all sources are empty', () => {
    expect(readBinaryPath('claude', 'project-123')).toBeUndefined()
  })

  it('skips per-project check when projectId is undefined', () => {
    mockGet.mockImplementation((_profileId: string, key: string) => {
      if (key === BINARIES_CODEX_SETTING_KEY) {
        return { setting_value: '/global/codex' }
      }
      return null
    })

    expect(readBinaryPath('codex')).toBe('/global/codex')
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith(DEFAULT_PREFERENCE_PROFILE_ID, BINARIES_CODEX_SETTING_KEY)
  })

  it('treats whitespace-only per-project value as empty and falls through to global', () => {
    mockGet.mockImplementation((_profileId: string, key: string) => {
      if (key === `${BINARIES_CLAUDE_SETTING_KEY}.project-123`) {
        return { setting_value: '   ' }
      }
      if (key === BINARIES_CLAUDE_SETTING_KEY) {
        return { setting_value: '/global/claude' }
      }
      return null
    })

    expect(readBinaryPath('claude', 'project-123')).toBe('/global/claude')
  })

  it('treats whitespace-only global value as empty and falls through to file config', () => {
    mockGet.mockImplementation((_profileId: string, key: string) => {
      if (key === BINARIES_CODEX_SETTING_KEY) {
        return { setting_value: '  ' }
      }
      return null
    })
    mockLoadFromFile.mockReturnValue('/file/codex')

    expect(readBinaryPath('codex')).toBe('/file/codex')
  })

  it('uses correct setting key for claude', () => {
    readBinaryPath('claude')
    expect(mockGet).toHaveBeenCalledWith(DEFAULT_PREFERENCE_PROFILE_ID, BINARIES_CLAUDE_SETTING_KEY)
  })

  it('uses correct setting key for codex', () => {
    readBinaryPath('codex')
    expect(mockGet).toHaveBeenCalledWith(DEFAULT_PREFERENCE_PROFILE_ID, BINARIES_CODEX_SETTING_KEY)
  })

  it('uses custom profileId when provided', () => {
    readBinaryPath('claude', undefined, 'custom-profile')
    expect(mockGet).toHaveBeenCalledWith('custom-profile', BINARIES_CLAUDE_SETTING_KEY)
  })
})
