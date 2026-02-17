import { useEffect } from 'react'
import { useProfileSetting, useDefaultBackendType } from '@kombuse/ui/hooks'
import { normalizeBackendType } from '@kombuse/ui/lib/backend-utils'

const USER_PROFILE_ID = 'user-1'
const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'

export function useSyncDefaultBackend() {
  const { data: setting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_BACKEND_SETTING_KEY)
  const { setDefaultBackendType } = useDefaultBackendType()

  useEffect(() => {
    setDefaultBackendType(normalizeBackendType(setting?.setting_value))
  }, [setting?.setting_value, setDefaultBackendType])
}
