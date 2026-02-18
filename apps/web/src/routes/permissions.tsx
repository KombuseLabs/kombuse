import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePermissions } from '@kombuse/ui/hooks'
import { PermissionList, PermissionFilters, PermissionRulesTab } from '@kombuse/ui/components'
import { Button } from '@kombuse/ui/base'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@kombuse/ui/base'
import { Shield, RefreshCw } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import type { PermissionLogFilters } from '@kombuse/types'

type Filters = Omit<PermissionLogFilters, 'project_id'>

export function Permissions() {
  const { projectId } = useParams<{ projectId: string }>()
  const [activeTab, setActiveTab] = useState('decision-log')
  const [filters, setFilters] = useState<Filters>({ limit: 50 })
  const { data: entries, isLoading, error, refetch, isFetching } = usePermissions(
    projectId ?? '',
    filters
  )

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center gap-4 p-6 border-b">
        <Shield className="size-6" />
        <h1 className="text-2xl font-bold">Permissions</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="px-6 pt-4 border-b">
          <TabsList>
            <TabsTrigger value="decision-log">Decision Log</TabsTrigger>
            <TabsTrigger value="permission-rules">Permission Rules</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="decision-log"
          forceMount
          hidden={activeTab !== 'decision-log'}
          className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden"
        >
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <PermissionFilters filters={filters} onChange={setFilters} />
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
        </TabsContent>

        <TabsContent
          value="permission-rules"
          forceMount
          hidden={activeTab !== 'permission-rules'}
          className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
        >
          <PermissionRulesTab />
        </TabsContent>
      </Tabs>
    </main>
  )
}
