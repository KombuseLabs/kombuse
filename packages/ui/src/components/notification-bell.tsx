'use client'

import { Bell, Shield, Check, X, ExternalLink } from 'lucide-react'
import { Button } from '../base/button'
import { Badge } from '../base/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../base/popover'
import { useAppContext } from '../hooks/use-app-context'
import { useWebSocket } from '../hooks/use-websocket'
import type { PendingPermission } from '@kombuse/types'

export interface NotificationBellProps {
  /** Navigation function - receives full path to navigate to */
  onNavigate?: (path: string) => void
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
            {permissions.map((permission) => (
              <div
                key={permission.requestId}
                className="border-b border-amber-500/30 bg-amber-500/5 p-3 last:border-0"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-medium uppercase text-amber-600 dark:text-amber-400">
                    Permission
                  </span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:text-amber-300">
                    {permission.toolName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
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
                      onClick={() => {
                        const path = currentProjectId
                          ? `/projects/${currentProjectId}/chats/${permission.sessionId}`
                          : `/chats/${permission.sessionId}`
                        onNavigate(path)
                      }}
                    >
                      <ExternalLink className="mr-1 size-3" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
