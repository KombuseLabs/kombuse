'use client'

import { useState } from 'react'
import type { PendingPermission } from '@kombuse/types'
import { Check, X, MessageSquare, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../base/dialog'
import { Button } from '../base/button'
import { Input } from '../base/input'
import { Markdown } from './markdown'

export interface PlanPreviewDialogProps {
  permission: PendingPermission | null
  onOpenChange: (open: boolean) => void
  onAllow: (permission: PendingPermission) => void
  onDeny: (permission: PendingPermission, message?: string) => void
  onNavigate?: (path: string) => void
  navigationPath?: string
}

function isAllowedPromptsArray(value: unknown): value is { tool: string; prompt: string }[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).tool === 'string' &&
      typeof (item as Record<string, unknown>).prompt === 'string'
  )
}

export function PlanPreviewDialog({
  permission,
  onOpenChange,
  onAllow,
  onDeny,
  onNavigate,
  navigationPath,
}: PlanPreviewDialogProps) {
  const [showRevision, setShowRevision] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')

  const planContent = typeof permission?.input?.plan === 'string' ? permission.input.plan : ''

  const allowedPrompts = permission && isAllowedPromptsArray(permission.input?.allowedPrompts)
    ? permission.input.allowedPrompts as { tool: string; prompt: string }[]
    : null

  const handleApprove = () => {
    if (permission) {
      onAllow(permission)
      onOpenChange(false)
    }
  }

  const handleReject = () => {
    if (permission) {
      onDeny(permission)
      onOpenChange(false)
    }
  }

  const handleRequestChanges = () => {
    if (permission && revisionMessage.trim()) {
      onDeny(permission, revisionMessage.trim())
      onOpenChange(false)
    }
    setShowRevision(false)
    setRevisionMessage('')
  }

  return (
    <Dialog open={!!permission} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plan Review</DialogTitle>
          <DialogDescription>
            {permission?.description ?? 'Review the agent\'s plan before approving.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {planContent ? (
            <Markdown>{planContent}</Markdown>
          ) : (
            <p className="py-4 text-sm text-muted-foreground italic">
              No plan content available.
            </p>
          )}
        </div>

        {allowedPrompts && allowedPrompts.length > 0 && (
          <div className="border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">
              Permissions needed:
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {allowedPrompts.map((ap, i) => (
                <span
                  key={i}
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground"
                >
                  {ap.prompt}
                </span>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {showRevision ? (
            <div className="flex w-full items-center gap-2">
              <Input
                value={revisionMessage}
                onChange={(e) => setRevisionMessage(e.target.value)}
                placeholder="Describe the changes you'd like..."
                className="h-8 flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleRequestChanges()
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setShowRevision(false)
                    setRevisionMessage('')
                  }
                }}
                autoFocus
              />
              <Button size="sm" variant="outline" onClick={handleRequestChanges}>
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowRevision(false)
                  setRevisionMessage('')
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <Button size="sm" variant="default" onClick={handleApprove}>
                <Check className="mr-1 size-3" />
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReject}>
                <X className="mr-1 size-3" />
                Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowRevision(true)}>
                <MessageSquare className="mr-1 size-3" />
                Request Changes
              </Button>
              {onNavigate && navigationPath && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-xs"
                  onClick={() => {
                    onNavigate(navigationPath)
                    onOpenChange(false)
                  }}
                >
                  <ExternalLink className="mr-1 size-3" />
                  Open
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
