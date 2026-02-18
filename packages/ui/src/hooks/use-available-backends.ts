import { useMemo } from 'react'
import { BACKEND_TYPES, type BackendType } from '@kombuse/types'
import { useBackendStatus } from './use-backend-status'

const USER_FACING_BACKENDS: BackendType[] = [
  BACKEND_TYPES.CLAUDE_CODE,
  BACKEND_TYPES.CODEX,
]

export function useAvailableBackends() {
  const { data: statuses, isLoading } = useBackendStatus()

  const availableBackends = useMemo(() => {
    if (!statuses) return []
    return USER_FACING_BACKENDS.filter((bt) =>
      statuses.some((s) => s.backendType === bt && s.available),
    )
  }, [statuses])

  const isAvailable = useMemo(() => {
    if (!statuses) return () => false
    const availableSet = new Set(
      statuses.filter((s) => s.available).map((s) => s.backendType),
    )
    return (backendType: BackendType) => availableSet.has(backendType)
  }, [statuses])

  const noneAvailable = !isLoading && availableBackends.length === 0

  return { availableBackends, isAvailable, isLoading, noneAvailable }
}
