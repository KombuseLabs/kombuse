'use client'

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
import { Check, ChevronsUpDown, Tag, Plus } from 'lucide-react'
import { LabelForm } from './label-form'

interface LabelPickerProps {
  availableLabels: Label[]
  selectedLabelId: number | null
  onSelect: (labelId: number | null) => void
  onLabelCreate?: (data: { name: string; color: string }) => Promise<Label | void>
  isLoading?: boolean
  isCreating?: boolean
  className?: string
  placeholder?: string
}

function LabelPicker({
  availableLabels,
  selectedLabelId,
  onSelect,
  onLabelCreate,
  isLoading,
  isCreating,
  className,
  placeholder = 'Select a label...',
}: LabelPickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'select' | 'create'>('select')
  // Store newly created label temporarily until query refetches
  const [pendingLabel, setPendingLabel] = useState<Label | null>(null)

  // Find selected label from available labels, or use pending label as fallback
  const selectedLabel =
    availableLabels.find((l) => l.id === selectedLabelId) ??
    (pendingLabel?.id === selectedLabelId ? pendingLabel : null)

  // Clear pending label once it appears in availableLabels
  if (pendingLabel && availableLabels.some((l) => l.id === pendingLabel.id)) {
    setPendingLabel(null)
  }

  const handleSelect = (labelId: number) => {
    if (selectedLabelId === labelId) {
      onSelect(null)
    } else {
      onSelect(labelId)
    }
    setOpen(false)
  }

  const handleCreateClick = () => {
    setMode('create')
  }

  const handleFormSubmit = async (data: { name: string; color: string }) => {
    const newLabel = await onLabelCreate?.(data)
    setMode('select')
    // Auto-select the newly created label and close the popover
    if (newLabel?.id) {
      setPendingLabel(newLabel)
      onSelect(newLabel.id)
      setOpen(false)
    }
  }

  const handleFormCancel = () => {
    setMode('select')
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
            {selectedLabel ? (
              <>
                <div
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: selectedLabel.color }}
                />
                <span className="truncate">{selectedLabel.name}</span>
              </>
            ) : (
              <>
                <Tag className="size-4" />
                <span>{placeholder}</span>
              </>
            )}
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
                {availableLabels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => handleSelect(label.id)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate">{label.name}</span>
                    {selectedLabelId === label.id && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onLabelCreate && (
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
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isLoading={isCreating}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

export { LabelPicker }
export type { LabelPickerProps }
