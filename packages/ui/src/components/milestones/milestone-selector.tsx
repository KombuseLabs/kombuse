"use client"

import { useState, useEffect } from 'react'
import type { Milestone, MilestoneWithStats } from '@kombuse/types'
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
import { Check, ChevronsUpDown, Target, Plus } from 'lucide-react'
import { MilestoneForm } from './milestone-form'

function hasMilestoneStats(
  milestone: MilestoneWithStats | Milestone | null
): milestone is MilestoneWithStats {
  return milestone !== null && 'total_count' in milestone
}

interface MilestoneSelectorProps {
  availableMilestones: MilestoneWithStats[]
  selectedMilestoneId: number | null
  onSelect: (milestoneId: number | null) => void
  onMilestoneCreate?: (data: { title: string; description?: string; due_date?: string }) => Promise<Milestone | void>
  isLoading?: boolean
  isCreating?: boolean
  className?: string
  placeholder?: string
  showProgress?: boolean
}

function MilestoneSelector({
  availableMilestones,
  selectedMilestoneId,
  onSelect,
  onMilestoneCreate,
  isLoading,
  isCreating,
  className,
  placeholder = 'Set milestone...',
  showProgress = false,
}: MilestoneSelectorProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [pendingMilestone, setPendingMilestone] = useState<Milestone | null>(null)

  const selectedMilestone =
    availableMilestones.find((m) => m.id === selectedMilestoneId) ??
    (pendingMilestone?.id === selectedMilestoneId ? pendingMilestone : null)

  useEffect(() => {
    if (pendingMilestone && availableMilestones.some((m) => m.id === pendingMilestone.id)) {
      setPendingMilestone(null)
    }
  }, [pendingMilestone, availableMilestones])

  const handleSelect = (milestoneId: number) => {
    if (selectedMilestoneId === milestoneId) {
      onSelect(null)
    } else {
      onSelect(milestoneId)
    }
    setOpen(false)
  }

  const handleCreateClick = () => {
    setMode('create')
  }

  const handleFormSubmit = async (data: { title: string; description?: string; due_date?: string }) => {
    const newMilestone = await onMilestoneCreate?.(data)
    setMode('select')
    if (newMilestone && 'id' in newMilestone) {
      setPendingMilestone(newMilestone)
      onSelect(newMilestone.id)
      setOpen(false)
    }
  }

  const handleFormCancel = () => {
    setMode('select')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {selectedMilestone ? (
          <button
            type="button"
            disabled={isLoading}
            className={cn(
              'inline-flex items-center gap-1 rounded-full font-medium transition-opacity hover:opacity-80 cursor-pointer',
              'px-2 py-0.5 text-[10px]',
              selectedMilestone.status === 'closed'
                ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              className
            )}
          >
            <Target className="size-3" />
            <span className="truncate max-w-32">{selectedMilestone.title}</span>
            {showProgress && hasMilestoneStats(selectedMilestone) && selectedMilestone.total_count > 0 && (
              <span className="opacity-70">
                {selectedMilestone.closed_count}/{selectedMilestone.total_count}
              </span>
            )}
            <ChevronsUpDown className="ml-0.5 size-3 shrink-0 opacity-50" />
          </button>
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('justify-between', className)}
            disabled={isLoading}
          >
            <span className="flex items-center gap-2">
              <Target className="size-4" />
              <span>{placeholder}</span>
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {mode === 'select' ? (
          <Command>
            <CommandInput placeholder="Search milestones..." />
            <CommandList>
              <CommandEmpty>No milestones found.</CommandEmpty>
              <CommandGroup>
                {availableMilestones.map((milestone) => (
                  <CommandItem
                    key={milestone.id}
                    value={milestone.title}
                    onSelect={() => handleSelect(milestone.id)}
                    className="flex items-center gap-2"
                  >
                    <Target className="size-3.5 shrink-0" />
                    <span className="flex-1 truncate">{milestone.title}</span>
                    {milestone.total_count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {milestone.closed_count}/{milestone.total_count}
                      </span>
                    )}
                    {selectedMilestoneId === milestone.id && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onMilestoneCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleCreateClick}
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <Plus className="size-4" />
                      <span>Create new milestone</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        ) : (
          <MilestoneForm
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isLoading={isCreating}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

export { MilestoneSelector }
export type { MilestoneSelectorProps }
