import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePermissions } from '@kombuse/ui/hooks'
import { PermissionList, PermissionFilters } from '@kombuse/ui/components'
import { Button } from '@kombuse/ui/base'
import { Shield, RefreshCw } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import type { PermissionLogFilters } from '@kombuse/types'

type Filters = Omit<PermissionLogFilters, 'project_id'>

export function Permissions() {
  const { projectId } = useParams<{ projectId: string }>()
  const [filters, setFilters] = useState<Filters>({ limit: 50 })
  const { data: entries, isLoading, error, refetch, isFetching } = usePermissions(
    projectId ?? '',
    filters
  )

  return (
    <main className="flex flex-col h-[calc(100vh-var(--header-height))]">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Shield className="size-6" />
          <h1 className="text-2xl font-bold">Permissions</h1>
          <span className="text-sm text-muted-foreground">Permission decision log</span>
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
        <PermissionFilters filters={filters} onChange={setFilters} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading permissions...
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive">
            Error: {error.message}
          </div>
        )}

        {!isLoading && !error && entries && <PermissionList entries={entries} projectId={projectId} />}
      </div>

      {entries && entries.length >= (filters.limit || 50) && (
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
