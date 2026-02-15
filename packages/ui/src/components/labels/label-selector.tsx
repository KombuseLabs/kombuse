"use client"

import { useState } from 'react'
import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../base/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../../base/command'
import { Check, ChevronsUpDown, Tag, Plus, Pencil, Trash2 } from 'lucide-react'
import { LabelForm } from './label-form'

interface LabelSelectorProps {
  availableLabels: Label[]
  selectedLabelIds: number[]
  onLabelAdd: (labelId: number) => void
  onLabelRemove: (labelId: number) => void
  onLabelCreate?: (data: { name: string; color: string }) => Promise<Label | void>
  onLabelUpdate?: (id: number, data: { name: string; color: string }) => void
  onLabelDelete?: (id: number) => void
  isLoading?: boolean
  isCreating?: boolean
  isUpdating?: boolean
  isDeleting?: boolean
  className?: string
}

function LabelSelector({
  availableLabels,
  selectedLabelIds,
  onLabelAdd,
  onLabelRemove,
  onLabelCreate,
  onLabelUpdate,
  onLabelDelete,
  isLoading,
  isCreating,
  isUpdating,
  isDeleting,
  className,
}: LabelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'select' | 'create' | 'edit'>('select')
  const [editingLabel, setEditingLabel] = useState<Label | null>(null)
  // Store newly created label temporarily until query refetches
  const [pendingLabel, setPendingLabel] = useState<Label | null>(null)

  // Clear pending label once it appears in availableLabels
  if (pendingLabel && availableLabels.some((l) => l.id === pendingLabel.id)) {
    setPendingLabel(null)
  }

  // Merge pending label into the display list so it's visible before refetch
  const displayLabels =
    pendingLabel && !availableLabels.some((l) => l.id === pendingLabel.id)
      ? [...availableLabels, pendingLabel]
      : availableLabels

  const isSelected = (labelId: number) => selectedLabelIds.includes(labelId)
  const canManage = onLabelCreate && onLabelUpdate && onLabelDelete

  const handleSelect = (labelId: number) => {
    if (isSelected(labelId)) {
      onLabelRemove(labelId)
    } else {
      onLabelAdd(labelId)
    }
  }

  const handleCreateClick = () => {
    setMode('create')
    setEditingLabel(null)
  }

  const handleEditClick = (e: React.MouseEvent, label: Label) => {
    e.stopPropagation()
    setMode('edit')
    setEditingLabel(label)
  }

  const handleDeleteClick = (e: React.MouseEvent, label: Label) => {
    e.stopPropagation()
    onLabelDelete?.(label.id)
  }

  const handleFormSubmit = async (data: { name: string; color: string }) => {
    if (mode === 'create') {
      try {
        const newLabel = await onLabelCreate?.(data)
        setMode('select')
        setEditingLabel(null)
        if (newLabel?.id) {
          setPendingLabel(newLabel)
          onLabelAdd(newLabel.id)
        }
      } catch {
        // Stay in create mode so the user can retry
      }
      return
    }
    if (mode === 'edit' && editingLabel) {
      onLabelUpdate?.(editingLabel.id, data)
    }
    setMode('select')
    setEditingLabel(null)
  }

  const handleFormCancel = () => {
    setMode('select')
    setEditingLabel(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between', className)}
          disabled={isLoading}
        >
          <span className="flex items-center gap-2">
            <Tag className="size-4" />
            {selectedLabelIds.length === 0
              ? 'Add labels...'
              : `${selectedLabelIds.length} label${selectedLabelIds.length > 1 ? 's' : ''}`}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {mode === 'select' ? (
          <Command>
            <CommandInput placeholder="Search labels..." />
            <CommandList>
              <CommandEmpty>No labels found.</CommandEmpty>
              <CommandGroup>
                {displayLabels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => handleSelect(label.id)}
                    className="flex items-center gap-2 group"
                  >
                    <div
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate">{label.name}</span>
                    {isSelected(label.id) && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                    {canManage && (
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleEditClick(e, label)}
                          className="p-1 rounded hover:bg-accent"
                        >
                          <Pencil className="size-3 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(e, label)}
                          disabled={isDeleting}
                          className="p-1 rounded hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {canManage && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleCreateClick}
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <Plus className="size-4" />
                      <span>Create new label</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        ) : (
          <LabelForm
            label={editingLabel ?? undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isLoading={isCreating || isUpdating}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

export { LabelSelector }
