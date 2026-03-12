'use client'

import { useState } from 'react'
import type { AgentTrigger } from '@kombuse/types'
import { ChevronDown, ChevronRight, Plus, Zap } from 'lucide-react'
import { Button } from '@/base/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/base/collapsible'
import { TriggerList } from './trigger-list'
import { TriggerForm, type TriggerFormData } from './trigger-form'
import { useProjectLabels } from '@/hooks/use-labels'
import { useAppContext } from '@/hooks/use-app-context'

interface TriggerEditorProps {
  agentId: string
  triggers: AgentTrigger[]
  onCreateTrigger: (data: TriggerFormData) => Promise<void>
  onUpdateTrigger: (id: number, data: Partial<TriggerFormData>) => Promise<void>
  onDeleteTrigger: (id: number) => Promise<void>
  onToggleTrigger: (id: number, enabled: boolean) => Promise<void>
  isCreating?: boolean
  isUpdating?: boolean
  deletingId?: number
  togglingId?: number
  className?: string
}

type EditorMode = 'list' | 'create' | 'edit'

function TriggerEditor({
  agentId,
  triggers,
  onCreateTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
  onToggleTrigger,
  isCreating,
  isUpdating,
  deletingId,
  togglingId,
  className,
}: TriggerEditorProps) {
  const { currentProjectId } = useAppContext()
  const { data: labels } = useProjectLabels(currentProjectId ?? '')
  const [isOpen, setIsOpen] = useState(true)
  const [mode, setMode] = useState<EditorMode>('list')
  const [editingTrigger, setEditingTrigger] = useState<AgentTrigger | null>(null)

  const handleEdit = (trigger: AgentTrigger) => {
    setEditingTrigger(trigger)
    setMode('edit')
  }

  const handleCreate = () => {
    setEditingTrigger(null)
    setMode('create')
  }

  const handleCancel = () => {
    setMode('list')
    setEditingTrigger(null)
  }

  const handleFormSubmit = async (data: TriggerFormData) => {
    if (mode === 'create') {
      await onCreateTrigger(data)
    } else if (mode === 'edit' && editingTrigger) {
      await onUpdateTrigger(editingTrigger.id, data)
    }
    setMode('list')
    setEditingTrigger(null)
  }

  const enabledCount = triggers.filter((t) => t.is_enabled).length

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Zap className="size-4" />
            <span className="font-medium">Triggers</span>
            {triggers.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({enabledCount}/{triggers.length} active)
              </span>
            )}
          </Button>
        </CollapsibleTrigger>

        {isOpen && mode === 'list' && (
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="size-4 mr-1" />
            Add Trigger
          </Button>
        )}
      </div>

      <CollapsibleContent className="pt-4">
        {mode === 'list' ? (
          <TriggerList
            triggers={triggers}
            labels={labels}
            onEdit={handleEdit}
            onDelete={onDeleteTrigger}
            onToggle={onToggleTrigger}
            deletingId={deletingId}
            togglingId={togglingId}
          />
        ) : (
          <TriggerForm
            agentId={agentId}
            trigger={editingTrigger ?? undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleCancel}
            isLoading={isCreating || isUpdating}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export { TriggerEditor }
export type { TriggerEditorProps }
