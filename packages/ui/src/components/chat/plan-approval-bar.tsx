'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { FileCheck, Check, X, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'

export interface PlanApprovalBarProps {
  permission: SerializedAgentPermissionRequestEvent
  onRespond: (behavior: 'allow' | 'deny', message?: string) => void
}

interface AllowedPrompt {
  tool: string
  prompt: string
}

function isAllowedPromptsArray(value: unknown): value is AllowedPrompt[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).tool === 'string' &&
      typeof (item as Record<string, unknown>).prompt === 'string'
  )
}

export function PlanApprovalBar({ permission, onRespond }: PlanApprovalBarProps) {
  const [showRevision, setShowRevision] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')

  const { input } = permission

  const allowedPrompts = isAllowedPromptsArray(input.allowedPrompts) ? input.allowedPrompts : null

  const handleApprove = useCallback(() => {
    onRespond('allow')
  }, [onRespond])

  const handleReject = useCallback(() => {
    onRespond('deny')
  }, [onRespond])

  const handleRequestChanges = useCallback(() => {
    if (revisionMessage.trim()) {
      onRespond('deny', revisionMessage.trim())
    }
    setShowRevision(false)
    setRevisionMessage('')
  }, [onRespond, revisionMessage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!showRevision) {
          handleApprove()
        }
      }
      if (e.key === 'Escape') {
        if (showRevision) {
          setShowRevision(false)
          setRevisionMessage('')
        } else {
          setShowRevision(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showRevision, handleApprove])

  return (
    <div className={cn('border-t border-border bg-muted/40 p-3')}>
      <div className="flex items-start gap-3">
        <FileCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Plan Review Required
            </span>
          </div>

          <p className="mb-1 text-sm text-foreground">
            The agent has completed a plan and is ready for your review.
          </p>

          {allowedPrompts && allowedPrompts.length > 0 && (
            <div className="mb-2">
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

          {showRevision ? (
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleApprove}
              >
                <Check className="mr-1 size-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
              >
                <X className="mr-1 size-3" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRevision(true)}
              >
                <MessageSquare className="mr-1 size-3" />
                Request Changes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
