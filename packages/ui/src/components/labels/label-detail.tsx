'use client'

import type { Label as LabelType } from '@kombuse/types'
import { X, Trash2, Zap, ExternalLink, Puzzle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/base/card'
import { Badge } from '@/base/badge'
import { Button } from '@/base/button'
import { LabelForm } from './label-form'
import { getEventTypeOption } from '../triggers/event-type-constants'
import { useTriggersByLabel } from '@/hooks/use-triggers'
import { useAgentProfiles } from '@/hooks/use-agents'

interface LabelDetailProps {
  label: LabelType
  projectId: string
  pluginName?: string
  onClose?: () => void
  onSave?: (data: { name?: string; color?: string; description?: string }) => Promise<void>
  onDelete?: () => void
  onNavigateToAgent?: (agentId: string) => void
  isSaving?: boolean
  isDeleting?: boolean
}

function LabelDetail({
  label,
  projectId,
  pluginName,
  onClose,
  onSave,
  onDelete,
  onNavigateToAgent,
  isSaving,
  isDeleting,
}: LabelDetailProps) {
  const { data: triggers = [], isLoading: isLoadingTriggers } = useTriggersByLabel(label.id)
  const { data: profiles } = useAgentProfiles()

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

  const handleFormSubmit = async (data: { name: string; color: string; description?: string }) => {
    if (!onSave) return
    await onSave({
      name: data.name,
      color: data.color,
      description: data.description,
    })
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="size-10 rounded-full shrink-0"
              style={{ backgroundColor: label.color }}
            />
            <div>
              <CardTitle className="text-xl">{label.name}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">ID: {label.id}</span>
                {pluginName && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Puzzle className="size-3" />
                    {pluginName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-6">
        {/* Edit Form */}
        <LabelForm
          label={label}
          onSubmit={handleFormSubmit}
          onCancel={() => onClose?.()}
          isLoading={isSaving}
        />

        {/* Triggers Section */}
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Triggers</h3>
            {triggers.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {triggers.length}
              </Badge>
            )}
          </div>

          {isLoadingTriggers ? (
            <p className="text-sm text-muted-foreground">Loading triggers...</p>
          ) : triggers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No triggers reference this label.
            </p>
          ) : (
            <div className="space-y-2">
              {triggers.map((trigger) => {
                const profile = profileMap.get(trigger.agent_id)
                const eventType = getEventTypeOption(trigger.event_type)

                return (
                  <div
                    key={trigger.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md border p-3',
                      onNavigateToAgent && 'cursor-pointer hover:bg-muted/50'
                    )}
                    onClick={() => onNavigateToAgent?.(trigger.agent_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {profile?.name ?? trigger.agent_id}
                        </span>
                        <Badge
                          variant={trigger.is_enabled ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {trigger.is_enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {eventType?.label ?? trigger.event_type}
                      </p>
                    </div>
                    {onNavigateToAgent && (
                      <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { LabelDetail }
export type { LabelDetailProps }
