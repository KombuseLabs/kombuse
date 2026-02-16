import { useEffect } from 'react'
import { useProfileSetting, useDefaultBackendType } from '@kombuse/ui/hooks'
import { BACKEND_TYPES, type BackendType } from '@kombuse/types'

const USER_PROFILE_ID = 'user-1'
const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'

function normalizeBackendType(value?: string | null): BackendType {
  if (
    value === BACKEND_TYPES.CLAUDE_CODE
    || value === BACKEND_TYPES.CODEX
    || value === BACKEND_TYPES.MOCK
  ) {
    return value
  }
  return BACKEND_TYPES.CLAUDE_CODE
}

export function useSyncDefaultBackend() {
  const { data: setting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_BACKEND_SETTING_KEY)
  const { setDefaultBackendType } = useDefaultBackendType()

  useEffect(() => {
    setDefaultBackendType(normalizeBackendType(setting?.setting_value))
  }, [setting?.setting_value, setDefaultBackendType])
}
