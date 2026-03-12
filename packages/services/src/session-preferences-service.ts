import { profileSettingsRepository, loadBinaryPathFromFileConfig } from '@kombuse/persistence'
import { BACKEND_TYPES, BINARIES_CLAUDE_SETTING_KEY, BINARIES_CODEX_SETTING_KEY, type BackendType } from '@kombuse/types'

export { BINARIES_CLAUDE_SETTING_KEY, BINARIES_CODEX_SETTING_KEY }

export const DEFAULT_PREFERENCE_PROFILE_ID = 'user-1'
export const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'
export const CHAT_DEFAULT_MODEL_SETTING_KEY = 'chat.default_model'
export const AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY = 'agent.default_max_chain_depth'
export const CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY = 'chat.backend_idle_timeout_minutes'
export const MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY = 'mcp.anonymous_write_access'
export const NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY = 'notifications.scope_to_project'
export const FILE_LOGGING_ENABLED_SETTING_KEY = 'logging.file_enabled'
export const CRASH_REPORTING_ENABLED_SETTING_KEY = 'telemetry.crash_reporting_enabled'
export const MAX_CHAIN_DEPTH = 15

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

export function readMcpAnonymousWriteAccess(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): 'allowed' | 'denied' {
  const setting = profileSettingsRepository.get(profileId, MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY)
  if (setting?.setting_value === 'allowed') return 'allowed'
  return 'denied'
}

export type NotificationScope = 'project' | 'all'

export function readNotificationScope(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): NotificationScope {
  const setting = profileSettingsRepository.get(profileId, NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY)
  if (setting?.setting_value === 'all') return 'all'
  return 'project'
}

export function readFileLoggingEnabled(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): boolean {
  const setting = profileSettingsRepository.get(profileId, FILE_LOGGING_ENABLED_SETTING_KEY)
  return setting?.setting_value === 'true'
}

export function readCrashReportingEnabled(
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): boolean {
  const setting = profileSettingsRepository.get(profileId, CRASH_REPORTING_ENABLED_SETTING_KEY)
  return setting?.setting_value !== 'false'
}

export function readBinaryPath(
  binaryName: 'claude' | 'codex',
  projectId?: string,
  profileId: string = DEFAULT_PREFERENCE_PROFILE_ID
): string | undefined {
  const baseKey = binaryName === 'claude' ? BINARIES_CLAUDE_SETTING_KEY : BINARIES_CODEX_SETTING_KEY

  // Per-project profile setting
  if (projectId) {
    const projectSetting = profileSettingsRepository.get(profileId, `${baseKey}.${projectId}`)
    const projectValue = projectSetting?.setting_value?.trim()
    if (projectValue) return projectValue
  }

  // Global profile setting
  const globalSetting = profileSettingsRepository.get(profileId, baseKey)
  const globalValue = globalSetting?.setting_value?.trim()
  if (globalValue) return globalValue

  // File config fallback (~/.kombuse/config.json)
  return loadBinaryPathFromFileConfig(binaryName)
}
