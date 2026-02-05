'use client'

import { useState } from 'react'
import type { AgentTrigger } from '@kombuse/types'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Switch } from '../../base/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../base/select'
import { ConditionEditor } from './condition-editor'
import { EVENT_TYPE_OPTIONS, EVENT_TYPE_CATEGORIES } from './event-type-constants'
import { LabelPicker } from '../labels/label-picker'
import { useProjectLabels, useCreateLabel } from '../../hooks/use-labels'
import { useAppContext } from '../../hooks/use-app-context'

export interface TriggerFormData {
  event_type: string
  conditions?: Record<string, unknown>
  priority: number
  is_enabled: boolean
}

interface TriggerFormProps {
  trigger?: AgentTrigger
  onSubmit: (data: TriggerFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

function TriggerForm({ trigger, onSubmit, onCancel, isLoading }: TriggerFormProps) {
  const [eventType, setEventType] = useState(trigger?.event_type ?? '')
  const [conditions, setConditions] = useState<Record<string, unknown> | null>(
    trigger?.conditions ?? null
  )
  const [priority, setPriority] = useState(trigger?.priority ?? 0)
  const [isEnabled, setIsEnabled] = useState(trigger?.is_enabled ?? true)
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(
    (trigger?.conditions?.label_id as number) ?? null
  )

  // Get project context for label operations
  const { currentProjectId } = useAppContext()
  const { data: projectLabels, isLoading: isLoadingLabels } = useProjectLabels(
    currentProjectId ?? ''
  )
  const createLabelMutation = useCreateLabel(currentProjectId ?? '')

  // Check if this is a label-based event type
  const isLabelEvent = eventType === 'label.added' || eventType === 'label.removed'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (eventType.trim()) {
      // For label events, include the selected label_id in conditions
      const finalConditions = isLabelEvent && selectedLabelId
        ? { ...conditions, label_id: selectedLabelId }
        : conditions

      onSubmit({
        event_type: eventType,
        conditions: finalConditions ?? undefined,
        priority,
        is_enabled: isEnabled,
      })
    }
  }

  const isValid = eventType.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="event-type">Event Type</Label>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger>
            <SelectValue placeholder="Select an event type..." />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPE_CATEGORIES.map((category) => (
              <SelectGroup key={category}>
                <SelectLabel className="capitalize">{category} Events</SelectLabel>
                {EVENT_TYPE_OPTIONS.filter((opt) => opt.category === category).map(
                  (option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  )
                )}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Conditions (Optional)</Label>
        <p className="text-xs text-muted-foreground">
          Filter when this trigger fires based on event data
        </p>
        {isLabelEvent && currentProjectId ? (
          <LabelPicker
            availableLabels={projectLabels ?? []}
            selectedLabelId={selectedLabelId}
            onSelect={setSelectedLabelId}
            onLabelCreate={(data) => createLabelMutation.mutateAsync(data)}
            isLoading={isLoadingLabels}
            isCreating={createLabelMutation.isPending}
            placeholder="Select a label to trigger on..."
          />
        ) : (
          <ConditionEditor conditions={conditions} onChange={setConditions} disabled={isLoading} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="priority">Priority</Label>
        <Input
          id="priority"
          type="number"
          min={0}
          value={priority}
          onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
          disabled={isLoading}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          Higher priority triggers run first (0 = lowest)
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="is-enabled">Enabled</Label>
        <Switch
          id="is-enabled"
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
          disabled={isLoading}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isLoading}>
          {trigger ? 'Update' : 'Create'} Trigger
        </Button>
      </div>
    </form>
  )
}

export { TriggerForm }
export type { TriggerFormProps }
