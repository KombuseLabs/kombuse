import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  useSessionsPerDay,
  useDurationPercentiles,
  usePipelineStageDuration,
  useMostFrequentReads,
  useToolCallsPerSession,
  useSlowestTools,
  useToolCallVolume,
} from '@kombuse/ui/hooks'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kombuse/ui/base'
import { BarChart3, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@kombuse/ui/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useElementWidth } from '../hooks/use-element-width'

const DAYS_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]

const CHART_HEIGHT = 256

const SECTIONS = [
  { id: 'sessions-per-day', title: 'Sessions per Day' },
  { id: 'duration-percentiles', title: 'Session Duration by Agent', description: 'p50 / p90 / p99 duration of completed sessions' },
  { id: 'pipeline-stage-duration', title: 'Pipeline Stage Duration', description: 'Average / p50 / p90 duration per agent invocation' },
  { id: 'most-frequent-reads', title: 'Most Frequent Reads', description: 'Top 25 most-read files across all agent sessions', colSpan2: true },
  { id: 'tool-call-volume', title: 'Tool Call Volume', description: 'Total calls and session spread per tool (cost proxy)' },
  { id: 'slowest-tools', title: 'Slowest Tools', description: 'p50 / p90 / p99 tool call duration (excludes aborted calls)' },
  { id: 'tool-calls-per-session', title: 'Tool Calls per Session', description: 'Tool call count by session, sorted by most active', colSpan2: true },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const SECTION_IDS: SectionId[] = SECTIONS.map((s) => s.id)
const STORAGE_KEY = 'analytics-expanded-sections'

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
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching({ queryKey: ['analytics'] })
  const isAnyFetching = fetchingCount > 0

  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        return new Set(
          parsed.filter((id): id is SectionId =>
            (SECTION_IDS as readonly string[]).includes(id),
          ),
        )
      }
    } catch {
      /* ignore */
    }
    return new Set<SectionId>()
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedSections]))
  }, [expandedSections])

  const toggleSection = useCallback((id: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allExpanded = expandedSections.size === SECTION_IDS.length

  const toggleAll = useCallback(() => {
    setExpandedSections(allExpanded ? new Set() : new Set(SECTION_IDS))
  }, [allExpanded])

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
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
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {allExpanded ? 'Collapse All' : 'Load All'}
          </Button>
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

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SECTIONS.map((section) => (
            <ChartCard
              key={section.id}
              title={section.title}
              description={'description' in section ? section.description : undefined}
              expanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              colSpan2={'colSpan2' in section ? section.colSpan2 : undefined}
            >
              <SectionContent
                sectionId={section.id}
                projectId={projectId ?? ''}
                days={days}
              />
            </ChartCard>
          ))}
        </div>
      </div>
    </main>
  )
}

function ChartCard({
  title,
  description,
  expanded,
  onToggle,
  colSpan2,
  children,
}: {
  title: string
  description?: string
  expanded: boolean
  onToggle: () => void
  colSpan2?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={colSpan2 ? 'lg:col-span-2' : undefined}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left group"
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
      </button>
      {description && (
        <p className="text-sm text-muted-foreground ml-6">{description}</p>
      )}
      {expanded && <div className="mt-4">{children}</div>}
    </section>
  )
}

function SectionContent({
  sectionId,
  projectId,
  days,
}: {
  sectionId: SectionId
  projectId: string
  days: number
}) {
  switch (sectionId) {
    case 'sessions-per-day':
      return <SessionsPerDayContent projectId={projectId} days={days} />
    case 'duration-percentiles':
      return <DurationPercentilesContent projectId={projectId} days={days} />
    case 'pipeline-stage-duration':
      return <PipelineStageContent projectId={projectId} days={days} />
    case 'most-frequent-reads':
      return <MostFrequentReadsContent projectId={projectId} days={days} />
    case 'tool-call-volume':
      return <ToolCallVolumeContent projectId={projectId} days={days} />
    case 'slowest-tools':
      return <SlowestToolsContent projectId={projectId} days={days} />
    case 'tool-calls-per-session':
      return <ToolCallsPerSessionContent projectId={projectId} days={days} />
  }
}

function SessionsPerDayContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useSessionsPerDay(projectId, days)
  const chart = useElementWidth()

  return (
    <ChartState query={query} emptyText={`No sessions in the last ${days} days.`}>
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <BarChart data={query.data} width={chart.width} height={CHART_HEIGHT}>
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
        )}
      </div>
    </ChartState>
  )
}

function DurationPercentilesContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useDurationPercentiles(projectId, days)
  const chart = useElementWidth()
  const chartData = useMemo(
    () =>
      query.data?.map((row) => ({
        name: row.agent_name ?? 'No Agent',
        p50: Math.round(row.p50),
        p90: Math.round(row.p90),
        p99: Math.round(row.p99),
      })),
    [query.data],
  )

  return (
    <ChartState query={query} emptyText={`No completed sessions in the last ${days} days.`}>
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <BarChart
            data={chartData}
            layout="vertical"
            width={chart.width}
            height={CHART_HEIGHT}
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
        )}
      </div>
    </ChartState>
  )
}

function PipelineStageContent({ projectId, days }: { projectId: string; days: number }) {
  const query = usePipelineStageDuration(projectId, days)
  const chart = useElementWidth()
  const chartData = useMemo(
    () =>
      query.data?.map((row) => ({
        name: row.agent_name,
        avg: Math.round(row.avg_duration),
        p50: Math.round(row.p50),
        p90: Math.round(row.p90),
      })),
    [query.data],
  )

  return (
    <ChartState query={query} emptyText={`No completed invocations in the last ${days} days.`}>
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <BarChart data={chartData} width={chart.width} height={CHART_HEIGHT}>
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
        )}
      </div>
    </ChartState>
  )
}

function MostFrequentReadsContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useMostFrequentReads(projectId, days)

  return (
    <ChartState query={query} emptyText={`No file reads in the last ${days} days.`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Rank</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">File Path</th>
              <th className="text-right py-2 font-medium text-muted-foreground">Reads</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((row, i) => (
              <tr key={row.file_path} className="border-b border-border/50">
                <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-4 font-mono text-xs truncate max-w-md">{row.file_path}</td>
                <td className="py-2 text-right tabular-nums">{row.read_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartState>
  )
}

function ToolCallVolumeContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useToolCallVolume(projectId, days)
  const chart = useElementWidth()

  return (
    <ChartState query={query} emptyText={`No tool calls in the last ${days} days.`}>
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <BarChart data={query.data} width={chart.width} height={CHART_HEIGHT}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="tool_name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar
              dataKey="call_count"
              name="Total Calls"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="session_count"
              name="Sessions"
              fill="hsl(var(--primary) / 0.4)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        )}
      </div>
    </ChartState>
  )
}

function SlowestToolsContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useSlowestTools(projectId, days)
  const chart = useElementWidth()
  const chartData = useMemo(
    () =>
      query.data?.map((row) => ({
        name: row.tool_name,
        p50: Math.round(row.p50),
        p90: Math.round(row.p90),
        p99: Math.round(row.p99),
      })),
    [query.data],
  )

  return (
    <ChartState query={query} emptyText={`No tool duration data in the last ${days} days.`}>
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <BarChart
            data={chartData}
            layout="vertical"
            width={chart.width}
            height={CHART_HEIGHT}
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
        )}
      </div>
    </ChartState>
  )
}

function ToolCallsPerSessionContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useToolCallsPerSession(projectId, days)

  return (
    <ChartState query={query} emptyText={`No tool calls in the last ${days} days.`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Session</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Agent</th>
              <th className="text-right py-2 font-medium text-muted-foreground">Tool Calls</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((row) => (
              <tr key={row.session_id} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs">{row.session_id.slice(0, 12)}...</td>
                <td className="py-2 pr-4">{row.agent_name}</td>
                <td className="py-2 text-right tabular-nums">{row.call_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartState>
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
