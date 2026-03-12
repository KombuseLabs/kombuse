import type { PermissionLogFilters } from '@kombuse/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/base/select'
import { Button } from '@/base/button'
import { X } from 'lucide-react'

interface PermissionFiltersProps {
  filters: Omit<PermissionLogFilters, 'project_id'>
  onChange: (filters: Omit<PermissionLogFilters, 'project_id'>) => void
}

const toolOptions = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'WebFetch',
  'Task',
  'TodoWrite',
  'NotebookEdit',
]

const behaviorOptions: { label: string; value: NonNullable<PermissionLogFilters['behavior']> }[] = [
  { label: 'Allowed', value: 'allow' },
  { label: 'Denied', value: 'deny' },
  { label: 'Auto-approved', value: 'auto_approved' },
]

function PermissionFiltersComponent({ filters, onChange }: PermissionFiltersProps) {
  const hasFilters = filters.tool_name || filters.behavior

  const clearFilters = () => {
    onChange({ limit: filters.limit })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.tool_name || 'all'}
        onValueChange={(value) =>
          onChange({ ...filters, tool_name: value === 'all' ? undefined : value })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Tool" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tools</SelectItem>
          {toolOptions.map((tool) => (
            <SelectItem key={tool} value={tool}>
              {tool}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.behavior || 'all'}
        onValueChange={(value) =>
          onChange({
            ...filters,
            behavior: value === 'all' ? undefined : (value as PermissionLogFilters['behavior']),
          })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Decision" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All decisions</SelectItem>
          {behaviorOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="size-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}

export { PermissionFiltersComponent as PermissionFilters }
export type { PermissionFiltersProps }
