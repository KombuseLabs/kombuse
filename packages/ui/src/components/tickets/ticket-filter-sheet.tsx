"use client"

import type { TicketStatus, TicketFilters } from '@kombuse/types'
import type { Label } from '@kombuse/types'
import type { MilestoneWithStats } from '@kombuse/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../../base/sheet'
import { Button } from '../../base/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../base/select'
import { Badge } from '../../base/badge'
import { MilestoneBadge } from '../milestones/milestone-badge'
import { SlidersHorizontal, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StatusCountMap {
  all: number
  open: number
  in_progress: number
  blocked: number
  closed: number
}

interface TicketFilterSheetProps {
  statusFilter: TicketStatus | 'all'
  onStatusFilterChange: (status: TicketStatus | 'all') => void
  sortBy: NonNullable<TicketFilters['sort_by']>
  onSortByChange: (sortBy: string) => void
  sortOrder: NonNullable<TicketFilters['sort_order']>
  onSortOrderToggle: () => void
  showClosedSort: boolean
  labels: Label[]
  selectedLabelIds: number[]
  onLabelToggle: (labelId: number) => void
  onLabelsClear: () => void
  milestones?: MilestoneWithStats[]
  selectedMilestoneId: number | null
  onMilestoneToggle: (milestoneId: number) => void
  onMilestoneClear: () => void
  statusCounts?: StatusCountMap | null
  activeFilterCount: number
}

const STATUS_OPTIONS: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'closed', label: 'Closed' },
]

function TicketFilterSheet({
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderToggle,
  showClosedSort,
  labels,
  selectedLabelIds,
  onLabelToggle,
  onLabelsClear,
  milestones,
  selectedMilestoneId,
  onMilestoneToggle,
  onMilestoneClear,
  statusCounts,
  activeFilterCount,
}: TicketFilterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 size-5 rounded-full p-0 text-[10px] leading-none flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
          {/* Status */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const count = statusCounts?.[opt.value as keyof StatusCountMap]
                const isActive = statusFilter === opt.value
                return (
                  <Button
                    key={opt.value}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onStatusFilterChange(opt.value)}
                  >
                    {opt.label}
                    {count != null && (
                      <span className={cn("ml-1 text-xs", isActive ? "opacity-80" : "text-muted-foreground")}>
                        {count}
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
          </section>

          {/* Sort */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Sort</h3>
            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onValueChange={onSortByChange}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Created</SelectItem>
                  <SelectItem value="updated_at">Updated</SelectItem>
                  <SelectItem value="opened_at">Opened</SelectItem>
                  <SelectItem value="last_activity_at">Activity</SelectItem>
                  {showClosedSort && (
                    <SelectItem value="closed_at">Closed</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSortOrderToggle}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
              </Button>
            </div>
          </section>

          {/* Labels */}
          {labels.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Labels</h3>
                {selectedLabelIds.length > 0 && (
                  <button
                    type="button"
                    onClick={onLabelsClear}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {labels.map((label) => {
                  const isSelected = selectedLabelIds.includes(label.id)
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => onLabelToggle(label.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      {isSelected && <Check className="size-4 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Milestones */}
          {milestones && milestones.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Milestones</h3>
                {selectedMilestoneId !== null && (
                  <button
                    type="button"
                    onClick={onMilestoneClear}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {milestones.map((milestone) => (
                  <button
                    key={milestone.id}
                    type="button"
                    onClick={() => onMilestoneToggle(milestone.id)}
                    className={cn(
                      'transition-opacity',
                      selectedMilestoneId !== null && selectedMilestoneId !== milestone.id
                        ? 'opacity-40 hover:opacity-70'
                        : ''
                    )}
                  >
                    <MilestoneBadge milestone={milestone} size="sm" showProgress />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { TicketFilterSheet }
export type { TicketFilterSheetProps }
