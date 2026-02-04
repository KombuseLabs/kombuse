import { EVENT_TYPES, type ActorType, type EventFilters } from '@kombuse/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'
import { Button } from '../../base/button'
import { X } from 'lucide-react'

interface EventFiltersProps {
  filters: EventFilters
  onChange: (filters: EventFilters) => void
}

const eventTypeOptions = Object.entries(EVENT_TYPES).map(([key, value]) => ({
  label: key
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase()),
  value,
}))

const actorTypeOptions: { label: string; value: ActorType }[] = [
  { label: 'User', value: 'user' },
  { label: 'Agent', value: 'agent' },
  { label: 'System', value: 'system' },
]

function EventFiltersComponent({ filters, onChange }: EventFiltersProps) {
  const hasFilters = filters.event_type || filters.actor_type

  const clearFilters = () => {
    onChange({ limit: filters.limit })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.event_type || 'all'}
        onValueChange={(value) =>
          onChange({ ...filters, event_type: value === 'all' ? undefined : value })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Event type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {eventTypeOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.actor_type || 'all'}
        onValueChange={(value) =>
          onChange({
            ...filters,
            actor_type: value === 'all' ? undefined : (value as ActorType),
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Actor type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actors</SelectItem>
          {actorTypeOptions.map((opt) => (
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

export { EventFiltersComponent as EventFilters }
export type { EventFiltersProps }
