'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../base/dialog'
import { Button } from '../base/button'
import { Badge } from '../base/badge'
import { Progress } from '../base/progress'
import { useUpdates } from '../hooks/use-updates'
import { useShellUpdates } from '../hooks/use-shell-updates'
import { formatFileSize } from '../hooks/use-file-staging'
import type { UpdateStatus } from '@kombuse/types'

function StatusBadge({ status }: { status: UpdateStatus | null }) {
  if (!status) {
    return <Badge variant="secondary">N/A</Badge>
  }

  switch (status.state) {
    case 'idle':
      return <Badge variant="secondary">Up to date</Badge>
    case 'checking':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Checking...
        </Badge>
      )
    case 'available':
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25 hover:bg-blue-500/15">Update available</Badge>
    case 'downloading':
      return null
    case 'verifying':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Verifying...
        </Badge>
      )
    case 'ready':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/15">Ready to install</Badge>
    case 'error':
      return <Badge variant="destructive">Error</Badge>
  }
}

interface UpdateRowProps {
  label: string
  status: UpdateStatus | null
  onInstall: () => void
  onApply: () => void
  applyLabel: string
}

function UpdateRow({ label, status, onInstall, onApply, applyLabel }: UpdateRowProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">
            {status?.currentVersion ?? 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} />
          {status?.state === 'available' && (
            <Button size="sm" onClick={onInstall}>
              Download
            </Button>
          )}
          {status?.state === 'ready' && (
            <Button size="sm" onClick={onApply}>
              {applyLabel}
            </Button>
          )}
        </div>
      </div>
      {status?.state === 'downloading' && (
        <div className="flex flex-col gap-1">
          <Progress value={status.downloadProgress >= 0 ? status.downloadProgress : undefined} className="w-full" />
          <span className="text-xs text-muted-foreground">
            {status.downloadProgress >= 0
              ? `Downloading... ${status.downloadProgress}%`
              : status.bytesDownloaded != null && status.bytesDownloaded > 0
                ? `Downloading... ${formatFileSize(status.bytesDownloaded)}`
                : 'Downloading...'}
          </span>
        </div>
      )}
      {status?.state === 'error' && status.error && (
        <p className="text-xs text-destructive">{status.error}</p>
      )}
      {status?.state === 'available' && status.updateInfo && (
        <p className="text-xs text-muted-foreground">
          Version {status.updateInfo.version} available
        </p>
      )}
    </div>
  )
}

export function UpdateStatusDialog() {
  const [open, setOpen] = useState(false)
  const hasCheckedRef = useRef(false)

  const pkg = useUpdates()
  const shell = useShellUpdates()

  // Listen for IPC from Electron menu
  useEffect(() => {
    const cleanup = window.electron?.onCheckForUpdates?.(() => {
      setOpen(true)
    })
    return cleanup
  }, [])

  // Listen for CustomEvent from command palette
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('app:check-for-updates', handler)
    return () => window.removeEventListener('app:check-for-updates', handler)
  }, [])

  // Auto-check when dialog opens
  useEffect(() => {
    if (open && !hasCheckedRef.current) {
      hasCheckedRef.current = true
      pkg.checkForUpdates()
      shell.checkForUpdates()
    }
    if (!open) {
      hasCheckedRef.current = false
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAnyChecking = pkg.isChecking || shell.isChecking

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Updates</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <UpdateRow
            label="Package"
            status={pkg.status}
            onInstall={pkg.installUpdate}
            onApply={pkg.restartApp}
            applyLabel="Restart"
          />
          <UpdateRow
            label="App"
            status={shell.status}
            onInstall={shell.installUpdate}
            onApply={shell.quitAndInstall}
            applyLabel="Quit & Update"
          />
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={isAnyChecking}
            onClick={() => {
              pkg.checkForUpdates({ force: true })
              shell.checkForUpdates()
            }}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isAnyChecking ? 'animate-spin' : ''}`} />
            Check All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
