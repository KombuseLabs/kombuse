'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '../base/button'
import { Progress } from '../base/progress'
import { useUpdates } from '../hooks/use-updates'

interface UpdateAvailableToastProps {
  version: string
  onInstall: () => void
  onDismiss: () => void
}

function UpdateAvailableToast({ version, onInstall, onDismiss }: UpdateAvailableToastProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Update Available</p>
      <p className="text-sm text-muted-foreground">
        Version {version} is ready to download.
      </p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={onInstall}>
          Download & Install
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Later
        </Button>
      </div>
    </div>
  )
}

function DownloadProgressToast({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col gap-2 w-full min-w-[200px]">
      <p className="text-sm font-medium">Downloading Update...</p>
      <Progress value={progress} className="w-full" />
      <p className="text-xs text-muted-foreground">{progress}%</p>
    </div>
  )
}

function VerifyingToast() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Verifying Update...</p>
      <p className="text-xs text-muted-foreground">Checking integrity</p>
    </div>
  )
}

interface UpdateReadyToastProps {
  version: string
  onRestart: () => void
  onDismiss: () => void
}

function UpdateReadyToast({ version, onRestart, onDismiss }: UpdateReadyToastProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Update Ready</p>
      <p className="text-sm text-muted-foreground">
        Version {version} installed. Restart to apply.
      </p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={onRestart}>
          Restart Now
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Later
        </Button>
      </div>
    </div>
  )
}

/**
 * Component that listens for update status changes and shows
 * appropriate toast notifications.
 *
 * Place this once in your app root (e.g., alongside Toaster).
 * Only shows notifications in the desktop app.
 */
export function UpdateNotification() {
  const { status, installUpdate, restartApp, dismiss } = useUpdates()
  const toastIdRef = useRef<string | number | null>(null)
  const lastStateRef = useRef<string | null>(null)

  useEffect(() => {
    if (!status) return

    // Only react to state changes
    if (status.state === lastStateRef.current) {
      // Special case: update progress during download
      if (status.state === 'downloading' && toastIdRef.current) {
        toast.custom(
          () => <DownloadProgressToast progress={status.downloadProgress} />,
          { id: toastIdRef.current, duration: Infinity }
        )
      }
      return
    }
    lastStateRef.current = status.state

    // Dismiss previous toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }

    switch (status.state) {
      case 'available':
        if (status.updateInfo) {
          toastIdRef.current = toast.custom(
            (t) => (
              <UpdateAvailableToast
                version={status.updateInfo!.version}
                onInstall={installUpdate}
                onDismiss={() => {
                  toast.dismiss(t)
                  dismiss()
                }}
              />
            ),
            { duration: Infinity }
          )
        }
        break

      case 'downloading':
        toastIdRef.current = toast.custom(
          () => <DownloadProgressToast progress={status.downloadProgress} />,
          { duration: Infinity }
        )
        break

      case 'verifying':
        toastIdRef.current = toast.custom(
          () => <VerifyingToast />,
          { duration: Infinity }
        )
        break

      case 'ready':
        toastIdRef.current = toast.custom(
          (t) => (
            <UpdateReadyToast
              version={status.currentVersion}
              onRestart={restartApp}
              onDismiss={() => {
                toast.dismiss(t)
                dismiss()
              }}
            />
          ),
          { duration: Infinity }
        )
        break

      case 'error':
        toast.error(`Update failed: ${status.error}`)
        break
    }
  }, [status, installUpdate, restartApp, dismiss])

  // This component only manages toasts, no visible UI
  return null
}
