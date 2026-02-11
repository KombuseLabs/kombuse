import { useState } from 'react'
import { useEvents } from '@kombuse/ui/hooks'
import { EventList, EventFilters } from '@kombuse/ui/components'
import { Button } from '@kombuse/ui/base'
import { History, RefreshCw } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import type { EventFilters as EventFiltersType } from '@kombuse/types'

export function Events() {
  const [filters, setFilters] = useState<EventFiltersType>({ limit: 50 })
  const { data: events, isLoading, error, refetch, isFetching } = useEvents(filters)

  return (
    <main className="flex flex-col h-[calc(100vh-var(--header-height))]">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <History className="size-6" />
          <h1 className="text-2xl font-bold">Events</h1>
          <span className="text-sm text-muted-foreground">System audit log</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('size-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="p-4 border-b bg-muted/30">
        <EventFilters filters={filters} onChange={setFilters} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading events...
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive">
            Error: {error.message}
          </div>
        )}

        {!isLoading && !error && events && <EventList events={events} />}
      </div>

      {events && events.length >= (filters.limit || 50) && (
        <div className="p-4 border-t text-center">
          <Button
            variant="outline"
            onClick={() =>
              setFilters({ ...filters, limit: (filters.limit || 50) + 50 })
            }
          >
            Load More
          </Button>
        </div>
      )}
    </main>
  )
}
