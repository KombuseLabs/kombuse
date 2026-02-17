import { useParams } from 'react-router-dom'
import { useSessionsPerDay } from '@kombuse/ui/hooks'
import { Button } from '@kombuse/ui/base'
import { BarChart3, RefreshCw } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export function Analytics() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error, refetch, isFetching } = useSessionsPerDay(
    projectId ?? '',
    30
  )

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <BarChart3 className="size-6" />
          <h1 className="text-2xl font-bold">Analytics</h1>
          <span className="text-sm text-muted-foreground">Sessions per day</span>
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

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading analytics...
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive">
            Error: {error.message}
          </div>
        )}

        {!isLoading && !error && data && data.length > 0 && (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) => {
                    const d = new Date(value + 'T00:00:00')
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }}
                  className="text-muted-foreground"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  labelFormatter={(value) => {
                    const d = new Date(String(value) + 'T00:00:00')
                    return d.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Sessions"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!isLoading && !error && data && data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No sessions in the last 30 days.
          </div>
        )}
      </div>
    </main>
  )
}
