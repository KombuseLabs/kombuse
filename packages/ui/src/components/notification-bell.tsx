'use client'

import { Bell, Shield, Check, X, ExternalLink, FileCheck, HelpCircle } from 'lucide-react'
import { Button } from '../base/button'
import { Badge } from '../base/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../base/popover'
import { useAppContext } from '../hooks/use-app-context'
import { useWebSocket } from '../hooks/use-websocket'
import type { PendingPermission } from '@kombuse/types'
import { extractPermissionDetail } from '../lib/permission-utils'

export interface NotificationBellProps {
  /** Navigation function - receives full path to navigate to */
  onNavigate?: (path: string) => void
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

/**
 * Header notification bell that shows pending permission requests.
 * Clicking opens a popover with Allow/Deny actions for each permission.
 */
export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { pendingPermissions, removePendingPermission, currentProjectId } = useAppContext()
  const { send } = useWebSocket({ topics: [] })

  const permissions = [...pendingPermissions.values()]
  const count = permissions.length

  const handleAllow = (permission: PendingPermission) => {
    send({
      type: 'permission.response',
      kombuseSessionId: permission.sessionId,
      requestId: permission.requestId,
      behavior: 'allow',
      updatedInput: permission.input,
    })
    // Optimistically remove from UI
    removePendingPermission(permission.requestId)
  }

  const handleDeny = (permission: PendingPermission) => {
    send({
      type: 'permission.response',
      kombuseSessionId: permission.sessionId,
      requestId: permission.requestId,
      behavior: 'deny',
    })
    // Optimistically remove from UI
    removePendingPermission(permission.requestId)
  }

  const getNavigationPath = (permission: PendingPermission) => {
    if (permission.ticketId && currentProjectId) {
      return `/projects/${currentProjectId}/tickets/${permission.ticketId}?session=${permission.sessionId}`
    }
    if (currentProjectId) {
      return `/projects/${currentProjectId}/chats/${permission.sessionId}`
    }
    return `/chats/${permission.sessionId}`
  }

  const renderPermissionCard = (permission: PendingPermission) => {
    if (permission.toolName === 'ExitPlanMode') {
      const allowedPrompts = isAllowedPromptsArray(permission.input?.allowedPrompts)
        ? permission.input.allowedPrompts as { tool: string; prompt: string }[]
        : null

      return (
        <div
          key={permission.requestId}
          className="border-b border-border bg-muted/40 p-3 last:border-0"
        >
          <div className="mb-1 flex items-center gap-2">
            <FileCheck className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Plan Review
            </span>
          </div>
          {permission.description && (
            <p className="mb-1 pl-6 text-sm text-foreground">
              {permission.description}
            </p>
          )}
          {allowedPrompts && allowedPrompts.length > 0 && (
            <div className="mb-2 pl-6">
              <div className="flex flex-wrap gap-1">
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAllow(permission)}
            >
              <Check className="mr-1 size-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDeny(permission)}
            >
              <X className="mr-1 size-3" />
              Reject
            </Button>
            {onNavigate && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-xs"
                onClick={() => onNavigate(getNavigationPath(permission))}
              >
                <ExternalLink className="mr-1 size-3" />
                Open
              </Button>
            )}
          </div>
        </div>
      )
    }

    if (permission.toolName === 'AskUserQuestion') {
      const inputRecord = permission.input as Record<string, unknown>
      const questions = Array.isArray(inputRecord.questions)
        ? (inputRecord.questions as Array<{ question?: string; header?: string; options?: Array<{ label: string }> }>)
        : []
      const firstQuestion = questions[0]

      return (
        <div
          key={permission.requestId}
          className="border-b border-border bg-muted/40 p-3 last:border-0"
        >
          <div className="mb-1 flex items-center gap-2">
            <HelpCircle className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Input Required
            </span>
          </div>
          {firstQuestion?.question ? (
            <p className="mb-1 pl-6 text-sm text-foreground">
              {firstQuestion.question}
            </p>
          ) : permission.description ? (
            <p className="mb-1 pl-6 text-sm text-foreground">
              {permission.description}
            </p>
          ) : null}
          {firstQuestion?.options && firstQuestion.options.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1 pl-6">
              {firstQuestion.options.slice(0, 4).map((opt) => (
                <span
                  key={opt.label}
                  className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {opt.label}
                </span>
              ))}
              {firstQuestion.options.length > 4 && (
                <span className="text-xs text-muted-foreground">
                  +{firstQuestion.options.length - 4} more
                </span>
              )}
            </div>
          )}
          {questions.length > 1 && (
            <p className="mb-1 pl-6 text-xs text-muted-foreground">
              +{questions.length - 1} more question{questions.length - 1 > 1 ? 's' : ''}
            </p>
          )}
          <div className="flex items-center gap-2">
            {onNavigate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigate(getNavigationPath(permission))}
              >
                <ExternalLink className="mr-1 size-3" />
                Reply
              </Button>
            )}
          </div>
        </div>
      )
    }

    // Default: generic permission card (unchanged)
    return (
      <div
        key={permission.requestId}
        className="border-b border-border bg-muted/40 p-3 last:border-0"
      >
        <div className="mb-1 flex items-center gap-2">
          <Shield className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium uppercase text-muted-foreground">
            Permission
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
            {permission.toolName}
          </span>
        </div>
        {permission.description && (
          <p className="mb-1 pl-6 text-sm text-foreground">
            {permission.description}
          </p>
        )}
        {(() => {
          const detail = extractPermissionDetail(
            permission.toolName,
            permission.input,
            permission.description
          )
          return detail ? (
            <pre className="mb-2 ml-6 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
              {detail.value}
            </pre>
          ) : null
        })()}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => handleAllow(permission)}
          >
            <Check className="mr-1 size-3" />
            Allow
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDeny(permission)}
          >
            <X className="mr-1 size-3" />
            Deny
          </Button>
          {onNavigate && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-xs"
              onClick={() => onNavigate(getNavigationPath(permission))}
            >
              <ExternalLink className="mr-1 size-3" />
              View
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex size-5 items-center justify-center p-0 text-xs"
            >
              {count > 9 ? '9+' : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <h4 className="text-sm font-medium">Notifications</h4>
        </div>
        {permissions.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No pending requests
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {permissions.map(renderPermissionCard)}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
