import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateStatus, UpdateCheckResult, ServerMessage } from '@kombuse/types'
import { useWebSocket } from './use-websocket'
import { getServerPort } from '../lib/api'
import { updateKeys } from '../lib/query-keys'
import { computeEffectiveStatus } from './update-utils'

const API_BASE = `http://localhost:${getServerPort()}/api`

interface UseShellUpdatesReturn {
  status: UpdateStatus | null
  isChecking: boolean
  isInstalling: boolean
  checkForUpdates: () => void
  installUpdate: () => void
  quitAndInstall: () => void
  dismiss: () => void
}

/**
 * Hook for managing shell (Electron binary) updates.
 *
 * Same pattern as useUpdates() but targets the shell-updates endpoints.
 * The key difference is quitAndInstall() which replaces the app binary
 * via IPC, versus restartApp() which relaunches to pick up a new package.
 */
export function useShellUpdates(): UseShellUpdatesReturn {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('kombuse:shell-update-dismissed-version')
  })

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'shell-update:status') {
        setStatus(message.status)
        queryClient.invalidateQueries({ queryKey: updateKeys.shellStatus })
      }
    },
    [queryClient]
  )

  useWebSocket({
    topics: ['shell-updates'],
    onMessage: handleMessage,
  })

  const { data: initialStatus } = useQuery({
    queryKey: updateKeys.shellStatus,
    queryFn: async (): Promise<UpdateStatus | null> => {
      try {
        const response = await fetch(`${API_BASE}/shell-updates/status`)
        if (response.status === 503) return null // Shell updates not available (web-only)
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
          console.error('[useShellUpdates] Status fetch failed:', body)
          return {
            state: 'error',
            currentVersion: '?',
            updateInfo: null,
            downloadProgress: 0,
            error: body?.error ?? `Status fetch failed (${response.status})`,
          }
        }
        return response.json() as Promise<UpdateStatus>
      } catch {
        // Server not reachable
        return null
      }
    },
    staleTime: Infinity,
  })

  useEffect(() => {
    if (initialStatus && !status) {
      setStatus(initialStatus)
    }
  }, [initialStatus, status])

  const checkMutation = useMutation({
    mutationFn: async (): Promise<UpdateCheckResult> => {
      const response = await fetch(`${API_BASE}/shell-updates/check`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Check failed')
      }
      return response.json()
    },
  })

  const installMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/shell-updates/install`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Install failed')
      }
      return response.json()
    },
  })

  const quitAndInstall = useCallback(() => {
    if (typeof window !== 'undefined' && window.electron?.shellUpdate?.quitAndInstall) {
      window.electron.shellUpdate.quitAndInstall()
    }
  }, [])

  const dismiss = useCallback(() => {
    const version = status?.updateInfo?.version ?? null
    setDismissedVersion(version)
    if (version && typeof window !== 'undefined') {
      localStorage.setItem('kombuse:shell-update-dismissed-version', version)
    }
  }, [status])

  const effectiveStatus = computeEffectiveStatus(status, dismissedVersion)

  return {
    status: effectiveStatus,
    isChecking: checkMutation.isPending,
    isInstalling: installMutation.isPending,
    checkForUpdates: () => checkMutation.mutate(),
    installUpdate: () => installMutation.mutate(),
    quitAndInstall,
    dismiss,
  }
}
