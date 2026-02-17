import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useSessionsPerDay,
  useDurationPercentiles,
  usePipelineStageDuration,
} from '@kombuse/ui/hooks'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kombuse/ui/base'
import { BarChart3, RefreshCw } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const DAYS_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.5rem',
  color: 'hsl(var(--popover-foreground))',
}

export function Analytics() {
  const { projectId } = useParams<{ projectId: string }>()
  const [days, setDays] = useState(30)

  const sessionsQuery = useSessionsPerDay(projectId ?? '', days)
  const durationQuery = useDurationPercentiles(projectId ?? '', days)
  const pipelineQuery = usePipelineStageDuration(projectId ?? '', days)

  const isAnyFetching =
    sessionsQuery.isFetching || durationQuery.isFetching || pipelineQuery.isFetching

  function refetchAll() {
    sessionsQuery.refetch()
    durationQuery.refetch()
    pipelineQuery.refetch()
  }

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <BarChart3 className="size-6" />
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={isAnyFetching}
          >
            <RefreshCw className={cn('size-4 mr-2', isAnyFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-10">
        {/* Sessions per Day */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Sessions per Day</h2>
          <ChartState query={sessionsQuery} emptyText={`No sessions in the last ${days} days.`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionsQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: string) => {
                      const d = new Date(value + 'T00:00:00')
                      return d.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(value) => {
                      const d = new Date(String(value) + 'T00:00:00')
                      return d.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    }}
                    contentStyle={tooltipStyle}
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
          </ChartState>
        </section>

        {/* Session Duration Percentiles */}
        <section>
          <h2 className="text-lg font-semibold mb-1">Session Duration by Agent</h2>
          <p className="text-sm text-muted-foreground mb-4">
            p50 / p90 / p99 duration of completed sessions
          </p>
          <ChartState
            query={durationQuery}
            emptyText={`No completed sessions in the last ${days} days.`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={durationQuery.data?.map((row) => ({
                    name: row.agent_name ?? 'No Agent',
                    p50: Math.round(row.p50),
                    p90: Math.round(row.p90),
                    p99: Math.round(row.p99),
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatMs(v)}
                  />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip
                    formatter={(value) => formatMs(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                  <Legend />
                  <Bar
                    dataKey="p50"
                    name="p50"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="p90"
                    name="p90"
                    fill="hsl(var(--primary) / 0.6)"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="p99"
                    name="p99"
                    fill="hsl(var(--primary) / 0.3)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartState>
        </section>

        {/* Pipeline Stage Duration */}
        <section>
          <h2 className="text-lg font-semibold mb-1">Pipeline Stage Duration</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Average / p50 / p90 duration per agent invocation
          </p>
          <ChartState
            query={pipelineQuery}
            emptyText={`No completed invocations in the last ${days} days.`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pipelineQuery.data?.map((row) => ({
                    name: row.agent_name,
                    avg: Math.round(row.avg_duration),
                    p50: Math.round(row.p50),
                    p90: Math.round(row.p90),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMs(v)} />
                  <Tooltip
                    formatter={(value) => formatMs(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                  <Legend />
                  <Bar
                    dataKey="avg"
                    name="Avg"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="p50"
                    name="p50"
                    fill="hsl(var(--primary) / 0.6)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="p90"
                    name="p90"
                    fill="hsl(var(--primary) / 0.3)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartState>
        </section>
      </div>
    </main>
  )
}

function ChartState({
  query,
  emptyText,
  children,
}: {
  query: { isLoading: boolean; error: Error | null; data?: unknown[] }
  emptyText: string
  children: React.ReactNode
}) {
  if (query.isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }
  if (query.error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error: {query.error.message}
      </div>
    )
  }
  if (!query.data || query.data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">{emptyText}</div>
    )
  }
  return <>{children}</>
}
