import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateStatus, UpdateCheckResult, ServerMessage } from '@kombuse/types'
import { useWebSocket } from './use-websocket'
import { getServerPort } from '../lib/api'

const API_BASE = `http://localhost:${getServerPort()}/api`

interface UseUpdatesReturn {
  /** Current update status */
  status: UpdateStatus | null
  /** Whether we're currently checking for updates */
  isChecking: boolean
  /** Whether we're currently installing an update */
  isInstalling: boolean
  /** Manually check for updates */
  checkForUpdates: () => void
  /** Download and install the available update */
  installUpdate: () => void
  /** Restart the app to apply the installed update */
  restartApp: () => void
  /** Dismiss the update notification (resets to idle) */
  dismiss: () => void
}

/**
 * Hook for managing application updates.
 *
 * Connects to WebSocket for real-time status updates and provides
 * actions to check, download, install, and apply updates.
 *
 * Only functional in the desktop app - returns null status in web browser.
 */
export function useUpdates(): UseUpdatesReturn {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Handle WebSocket messages for update status
  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'update:status') {
        setStatus(message.status)
        setDismissed(false) // Reset dismissed when status changes
        queryClient.invalidateQueries({ queryKey: ['updates', 'status'] })
      }
    },
    [queryClient]
  )

  // Connect to WebSocket for real-time status updates (via shared provider)
  useWebSocket({
    topics: ['updates'],
    onMessage: handleMessage,
  })

  // Initial status fetch
  const { data: initialStatus } = useQuery({
    queryKey: ['updates', 'status'],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_BASE}/updates/status`)
        if (!response.ok) return null
        return response.json() as Promise<UpdateStatus>
      } catch {
        // Updates API not available
        return null
      }
    },
    staleTime: Infinity, // Don't refetch, WebSocket handles updates
  })

  useEffect(() => {
    if (initialStatus && !status) {
      setStatus(initialStatus)
    }
  }, [initialStatus, status])

  // Check for updates mutation
  const checkMutation = useMutation({
    mutationFn: async (): Promise<UpdateCheckResult> => {
      const response = await fetch(`${API_BASE}/updates/check`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Check failed')
      }
      return response.json()
    },
  })

  // Install update mutation
  const installMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/updates/install`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Install failed')
      }
      return response.json()
    },
  })

  const restartApp = useCallback(() => {
    // Call the IPC API exposed via preload script
    if (typeof window !== 'undefined' && window.electron?.restart) {
      window.electron.restart()
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Return null status if dismissed and in 'available' state
  const effectiveStatus = dismissed && status?.state === 'available' ? null : status

  return {
    status: effectiveStatus,
    isChecking: checkMutation.isPending,
    isInstalling: installMutation.isPending,
    checkForUpdates: () => checkMutation.mutate(),
    installUpdate: () => installMutation.mutate(),
    restartApp,
    dismiss,
  }
}

// Window.electron type is declared in lib/api.ts
