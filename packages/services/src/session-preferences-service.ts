import { profileSettingsRepository } from '@kombuse/persistence'
import { BACKEND_TYPES, type BackendType } from '@kombuse/types'

export const DEFAULT_PREFERENCE_PROFILE_ID = 'user-1'
export const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'
export const CHAT_DEFAULT_MODEL_SETTING_KEY = 'chat.default_model'
export const AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY = 'agent.default_max_chain_depth'
export const CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY = 'chat.backend_idle_timeout_minutes'

interface BackendCapability {
  supportsModelSelection: boolean
}

const BACKEND_CAPABILITIES: Record<BackendType, BackendCapability> = {
  [BACKEND_TYPES.CLAUDE_CODE]: { supportsModelSelection: true },
  [BACKEND_TYPES.CODEX]: { supportsModelSelection: true },
  [BACKEND_TYPES.MOCK]: { supportsModelSelection: false },
}

export function getBackendCapability(backendType: BackendType): BackendCapability {
  return BACKEND_CAPABILITIES[backendType]
}

export function resolveConfiguredBackendType(value: unknown): BackendType | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  if (value === BACKEND_TYPES.CLAUDE_CODE || value === BACKEND_TYPES.CODEX || value === BACKEND_TYPES.MOCK) {
    return value
  }
  return undefined
}

export function normalizeModelPreference(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export interface ResolveBackendTypeInput {
  sessionBackendType?: unknown
  agentBackendType?: unknown
  userDefaultBackendType?: unknown
  fallbackBackendType?: BackendType
}

export function resolveBackendType(input: ResolveBackendTypeInput): BackendType {
  return (
    resolveConfiguredBackendType(input.sessionBackendType)
    ?? resolveConfiguredBackendType(input.agentBackendType)
    ?? resolveConfiguredBackendType(input.userDefaultBackendType)
    ?? input.fallbackBackendType
    ?? BACKEND_TYPES.CLAUDE_CODE
  )
}

export interface ResolveModelPreferenceInput {
  sessionModelPreference?: unknown
  agentModelPreference?: unknown
  userDefaultModelPreference?: unknown
  backendType: BackendType
}

export interface ResolvedModelPreference {
  modelPreference?: string
  appliedModel?: string
}

export function resolveModelPreference(input: ResolveModelPreferenceInput): ResolvedModelPreference {
  const modelPreference = normalizeModelPreference(input.sessionModelPreference)
    ?? normalizeModelPreference(input.agentModelPreference)
    ?? normalizeModelPreference(input.userDefaultModelPreference)

  const appliedModel = getBackendCapability(input.backendType).supportsModelSelection
    ? modelPreference
    : undefined

  return {
    modelPreference,
    appliedModel,
  }
}

export function readUserDefaultBackendType(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): BackendType | undefined {
  const setting = profileSettingsRepository.get(profileId, CHAT_DEFAULT_BACKEND_SETTING_KEY)
  return resolveConfiguredBackendType(setting?.setting_value)
}

export function readUserDefaultModelPreference(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): string | undefined {
  const setting = profileSettingsRepository.get(profileId, CHAT_DEFAULT_MODEL_SETTING_KEY)
  return normalizeModelPreference(setting?.setting_value)
}

export function readUserDefaultMaxChainDepth(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): number | undefined {
  const setting = profileSettingsRepository.get(profileId, AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY)
  if (!setting?.setting_value) return undefined
  const parsed = Number(setting.setting_value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return undefined
  return parsed
}

export function readUserBackendIdleTimeoutMinutes(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): number | null | undefined {
  const setting = profileSettingsRepository.get(profileId, CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY)
  if (!setting) return undefined
  if (!setting.setting_value?.trim()) return null
  const parsed = Number(setting.setting_value)
  if (!Number.isInteger(parsed) || parsed < 1) return undefined
  return parsed
}
