'use client'

import { useEffect, useState } from 'react'
import type { ActorType, AgentTrigger, AllowedInvoker, MentionType } from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { Button } from '@/base/button'
import { Input } from '@/base/input'
import { Label } from '@/base/label'
import { Switch } from '@/base/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/base/select'
import { ConditionEditor } from './condition-editor'
import { EVENT_TYPE_OPTIONS, EVENT_TYPE_CATEGORIES } from './event-type-constants'
import { LabelPicker } from '../labels/label-picker'
import { MentionTypePicker } from './mention-type-picker'
import { AuthorFilterPicker } from './author-filter-picker'
import { AllowedInvokersEditor } from './allowed-invokers-editor'
import { useProjectLabels, useCreateLabel } from '@/hooks/use-labels'
import { useAppContext } from '@/hooks/use-app-context'

export interface TriggerFormData {
  event_type: string
  conditions?: Record<string, unknown>
  priority: number
  is_enabled: boolean
  allowed_invokers?: AllowedInvoker[] | null
}

interface TriggerFormProps {
  agentId: string
  trigger?: AgentTrigger
  onSubmit: (data: TriggerFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

function stripAuthorFilterConditions(
  currentConditions: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!currentConditions) return null
  const { author_type: _authorType, author_id: _authorId, ...rest } = currentConditions
  return Object.keys(rest).length > 0 ? rest : null
}

function TriggerForm({ agentId, trigger, onSubmit, onCancel, isLoading }: TriggerFormProps) {
  const [eventType, setEventType] = useState(trigger?.event_type ?? '')
  const [conditions, setConditions] = useState<Record<string, unknown> | null>(() =>
    stripAuthorFilterConditions(trigger?.conditions ?? null)
  )
  const [priority, setPriority] = useState(trigger?.priority ?? 0)
  const [isEnabled, setIsEnabled] = useState(trigger?.is_enabled ?? true)
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(
    (trigger?.conditions?.label_id as number) ?? null
  )
  const [selectedMentionType, setSelectedMentionType] = useState<MentionType | null>(
    (trigger?.conditions?.mention_type as MentionType) ?? null
  )
  const [selectedAuthorType, setSelectedAuthorType] = useState<ActorType | null>(
    (trigger?.conditions?.author_type as ActorType) ?? null
  )
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<string[]>(() => {
    const ids = trigger?.conditions?.author_id
    if (Array.isArray(ids)) return ids as string[]
    return []
  })
  const [allowedInvokers, setAllowedInvokers] = useState<AllowedInvoker[] | null>(
    trigger?.allowed_invokers ?? null
  )

  // Get project context for label operations
  const { currentProjectId } = useAppContext()
  const { data: projectLabels, isLoading: isLoadingLabels } = useProjectLabels(
    currentProjectId ?? ''
  )
  const createLabelMutation = useCreateLabel(currentProjectId ?? '')

  // Check if this is a label-based or mention-based event type
  const isLabelEvent = eventType === EVENT_TYPES.LABEL_ADDED || eventType === EVENT_TYPES.LABEL_REMOVED
  const isMentionEvent = eventType === EVENT_TYPES.MENTION_CREATED
  const isCommentEvent = eventType === EVENT_TYPES.COMMENT_ADDED || eventType === EVENT_TYPES.COMMENT_EDITED

  useEffect(() => {
    if (isCommentEvent) {
      setConditions((current) => stripAuthorFilterConditions(current))
    }
  }, [isCommentEvent])

  const handleConditionsChange = (nextConditions: Record<string, unknown> | null) => {
    if (isCommentEvent) {
      setConditions(stripAuthorFilterConditions(nextConditions))
      return
    }
    setConditions(nextConditions)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (eventType.trim()) {
      // For label/mention events, include the specialized condition
      let finalConditions = conditions
      if (isLabelEvent && selectedLabelId) {
        finalConditions = { ...finalConditions, label_id: selectedLabelId }
      } else if (isMentionEvent && selectedMentionType) {
        finalConditions = { ...finalConditions, mention_type: selectedMentionType }
        if (selectedMentionType === 'profile') {
          finalConditions = { ...finalConditions, mentioned_profile_id: agentId }
        }
      } else if (isCommentEvent && selectedAuthorType) {
        finalConditions = { ...finalConditions, author_type: selectedAuthorType }
        if (selectedAuthorIds.length > 0) {
          finalConditions = { ...finalConditions, author_id: selectedAuthorIds }
        }
      }

      onSubmit({
        event_type: eventType,
        conditions: finalConditions ?? undefined,
        priority,
        is_enabled: isEnabled,
        allowed_invokers: allowedInvokers,
      })
    }
  }

  const isValid = eventType.trim().length > 0 && (!isMentionEvent || selectedMentionType !== null)

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
        <Label>Conditions {isMentionEvent ? '(Required)' : '(Optional)'}</Label>
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
        ) : isMentionEvent ? (
          <>
            <MentionTypePicker
              value={selectedMentionType}
              onValueChange={setSelectedMentionType}
              disabled={isLoading}
            />
            {selectedMentionType === 'profile' && (
              <p className="text-xs text-muted-foreground">
                Triggers only when this agent is @mentioned
              </p>
            )}
          </>
        ) : isCommentEvent ? (
          <>
            <AuthorFilterPicker
              value={{ authorType: selectedAuthorType, authorIds: selectedAuthorIds }}
              onValueChange={({ authorType, authorIds }) => {
                setSelectedAuthorType(authorType)
                setSelectedAuthorIds(authorIds)
              }}
              disabled={isLoading}
              projectId={currentProjectId ?? undefined}
            />
            <ConditionEditor
              conditions={conditions}
              onChange={handleConditionsChange}
              disabled={isLoading}
            />
          </>
        ) : (
          <ConditionEditor
            conditions={conditions}
            onChange={handleConditionsChange}
            disabled={isLoading}
          />
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

      <AllowedInvokersEditor
        value={allowedInvokers}
        onChange={setAllowedInvokers}
        disabled={isLoading}
        projectId={currentProjectId ?? undefined}
      />

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
