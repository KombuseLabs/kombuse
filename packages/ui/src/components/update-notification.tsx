'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '../base/button'
import { Progress } from '../base/progress'
import { useUpdates } from '../hooks/use-updates'
import { useShellUpdates } from '../hooks/use-shell-updates'

interface UpdateAvailableToastProps {
  version: string
  onInstall: () => void
  onDismiss: () => void
}

function UpdateAvailableToast({ version, onInstall, onDismiss }: UpdateAvailableToastProps) {
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2">
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
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2 w-full min-w-[200px]">
      <p className="text-sm font-medium">Downloading Update...</p>
      <Progress value={progress >= 0 ? progress : undefined} className="w-full" />
      <p className="text-xs text-muted-foreground">{progress >= 0 ? `${progress}%` : 'Downloading...'}</p>
    </div>
  )
}

function VerifyingToast() {
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2">
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
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2">
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

const ACTIVE_STATES = new Set(['available', 'downloading', 'verifying', 'ready'])

/**
 * Unified component that listens for both package and shell update status
 * changes and shows a single toast notification at a time.
 *
 * Shell updates take priority over package updates (since installing the
 * shell bundles the latest package).
 *
 * Place this once in your app root (e.g., alongside Toaster).
 * Only shows notifications in the desktop app.
 */
export function UnifiedUpdateNotification() {
  const pkg = useUpdates()
  const shell = useShellUpdates()
  const toastIdRef = useRef<string | number | null>(null)
  const lastKeyRef = useRef<string | null>(null)
  const lastErrorKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const shellActive = shell.status && ACTIVE_STATES.has(shell.status.state)
    const pkgActive = pkg.status && ACTIVE_STATES.has(pkg.status.state)

    // Determine which track to show (shell takes priority)
    const track = shellActive ? 'shell' : pkgActive ? 'package' : null
    const status = track === 'shell' ? shell.status : track === 'package' ? pkg.status : null

    if (!track || !status) {
      // Handle error states even when not "active", with dedup guard
      const errorKey = shell.status?.state === 'error'
        ? `shell:${shell.status.error}`
        : pkg.status?.state === 'error'
          ? `pkg:${pkg.status.error}`
          : null

      if (errorKey && errorKey !== lastErrorKeyRef.current) {
        lastErrorKeyRef.current = errorKey
        if (shell.status?.state === 'error') {
          toast.error(`App update failed: ${shell.status.error}`)
        } else if (pkg.status?.state === 'error') {
          toast.error(`Update failed: ${pkg.status.error}`)
        }
      }
      return
    }
    // Clear error ref when back to active state
    lastErrorKeyRef.current = null

    const key = `${track}:${status.state}`

    // Only react to state/track changes
    if (key === lastKeyRef.current) {
      // Special case: update progress during download
      if (status.state === 'downloading' && toastIdRef.current) {
        const ProgressComponent = track === 'shell' ? ShellDownloadProgressToast : DownloadProgressToast
        toast.custom(
          () => <ProgressComponent progress={status.downloadProgress} />,
          { id: toastIdRef.current, duration: Infinity }
        )
      }
      return
    }
    lastKeyRef.current = key

    // Dismiss previous toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }

    if (track === 'shell') {
      switch (status.state) {
        case 'available':
          if (status.updateInfo) {
            toastIdRef.current = toast.custom(
              (t) => (
                <ShellUpdateAvailableToast
                  version={status.updateInfo!.version}
                  onInstall={shell.installUpdate}
                  onDismiss={() => {
                    toast.dismiss(t)
                    shell.dismiss()
                  }}
                />
              ),
              { duration: Infinity }
            )
          }
          break
        case 'downloading':
          toastIdRef.current = toast.custom(
            () => <ShellDownloadProgressToast progress={status.downloadProgress} />,
            { duration: Infinity }
          )
          break
        case 'ready':
          toastIdRef.current = toast.custom(
            (t) => (
              <ShellUpdateReadyToast
                version={status.updateInfo?.version ?? status.currentVersion}
                onRestart={shell.quitAndInstall}
                onDismiss={() => {
                  toast.dismiss(t)
                  shell.dismiss()
                }}
              />
            ),
            { duration: Infinity }
          )
          break
      }
    } else {
      switch (status.state) {
        case 'available':
          if (status.updateInfo) {
            toastIdRef.current = toast.custom(
              (t) => (
                <UpdateAvailableToast
                  version={status.updateInfo!.version}
                  onInstall={pkg.installUpdate}
                  onDismiss={() => {
                    toast.dismiss(t)
                    pkg.dismiss()
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
                onRestart={pkg.restartApp}
                onDismiss={() => {
                  toast.dismiss(t)
                  pkg.dismiss()
                }}
              />
            ),
            { duration: Infinity }
          )
          break
      }
    }
  }, [pkg, shell])

  return null
}

function ShellUpdateAvailableToast({ version, onInstall, onDismiss }: UpdateAvailableToastProps) {
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2">
      <p className="text-sm font-medium">App Update Available</p>
      <p className="text-sm text-muted-foreground">
        Shell version {version} is ready to download.
      </p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={onInstall}>
          Download
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Later
        </Button>
      </div>
    </div>
  )
}

function ShellDownloadProgressToast({ progress }: { progress: number }) {
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2 w-full min-w-[200px]">
      <p className="text-sm font-medium">Downloading App Update...</p>
      <Progress value={progress >= 0 ? progress : undefined} className="w-full" />
      <p className="text-xs text-muted-foreground">{progress >= 0 ? `${progress}%` : 'Downloading...'}</p>
    </div>
  )
}

function ShellUpdateReadyToast({ version, onRestart, onDismiss }: UpdateReadyToastProps) {
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-4 shadow-lg flex flex-col gap-2">
      <p className="text-sm font-medium">App Update Ready</p>
      <p className="text-sm text-muted-foreground">
        Quit and update to version {version}.
      </p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={onRestart}>
          Quit & Update
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Later
        </Button>
      </div>
    </div>
  )
}

