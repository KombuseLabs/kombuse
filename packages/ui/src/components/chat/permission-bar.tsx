'use client'

import { useState } from 'react'
import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { Shield, Check, X, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'

export interface PermissionBarProps {
  permission: SerializedAgentPermissionRequestEvent
  onRespond: (behavior: 'allow' | 'deny', message?: string) => void
}

export function PermissionBar({ permission, onRespond }: PermissionBarProps) {
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [suggestion, setSuggestion] = useState('')

  const { toolName, input } = permission
  const description = typeof input.description === 'string' ? input.description : null
  const command = typeof input.command === 'string' ? input.command : null

  const handleAllow = () => {
    onRespond('allow')
  }

  const handleReject = () => {
    onRespond('deny')
  }

  const handleSuggest = () => {
    if (suggestion.trim()) {
      onRespond('deny', suggestion.trim())
    }
    setShowSuggestion(false)
    setSuggestion('')
  }

  return (
    <div className={cn('border-t border-amber-500/30 bg-amber-500/10 p-3')}>
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-amber-600 dark:text-amber-400">
              Permission Request
            </span>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:text-amber-300">
              {toolName}
            </span>
          </div>

          {description && (
            <p className="mb-1 text-sm text-foreground">{description}</p>
          )}

          {command && (
            <pre className="mb-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
              {command}
            </pre>
          )}

          {showSuggestion ? (
            <div className="flex items-center gap-2">
              <Input
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="Suggest an alternative..."
                className="h-8 flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSuggest()
                  if (e.key === 'Escape') {
                    setShowSuggestion(false)
                    setSuggestion('')
                  }
                }}
                autoFocus
              />
              <Button size="sm" variant="outline" onClick={handleSuggest}>
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowSuggestion(false)
                  setSuggestion('')
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
                className="bg-green-600 hover:bg-green-700"
                onClick={handleAllow}
              >
                <Check className="mr-1 size-3" />
                Allow
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
                onClick={() => setShowSuggestion(true)}
              >
                <MessageSquare className="mr-1 size-3" />
                Suggest
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
