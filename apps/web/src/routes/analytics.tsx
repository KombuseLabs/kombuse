import React, { useState, useMemo } from 'react'
import { useAppContext } from '@kombuse/ui/hooks'
import {
  useSessionsPerDay,
  useDurationPercentiles,
  usePipelineStageDuration,
  useMostFrequentReads,
  useToolCallsPerSession,

  useToolCallVolume,
  useTicketBurndown,
  useAgentRuntimePerTicket,
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
  AreaChart,
  Area,
  Line,
  Rectangle,
} from 'recharts'
import type { AgentRuntimeSegmentEntry } from '@kombuse/ui/lib/api'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useElementWidth } from '../hooks/use-element-width'

const DAYS_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]

const CHART_HEIGHT = 256

const SECTIONS = [
  { id: 'ticket-burndown', title: 'Ticket Burndown', description: 'Open tickets over time with ideal trend line' },
  { id: 'sessions-per-day', title: 'Sessions per Day' },
  { id: 'duration-percentiles', title: 'Session Duration by Agent', description: 'p50 / p90 / p99 duration of completed sessions' },
  { id: 'pipeline-stage-duration', title: 'Pipeline Stage Duration', description: 'Average / p50 / p90 duration per agent invocation' },
  { id: 'most-frequent-reads', title: 'Most Frequent Reads', description: 'Top 25 most-read files across all agent sessions', colSpan2: true },
  { id: 'tool-call-volume', title: 'Tool Call Volume', description: 'Total calls and session spread per tool (cost proxy)' },
  // Temporarily disabled — see #476
  // { id: 'slowest-tools', title: 'Slowest Tools', description: 'p50 / p90 / p99 tool call duration (excludes aborted calls)' },
  { id: 'tool-calls-per-session', title: 'Tool Calls per Session', description: 'Tool call count by session, sorted by most active', colSpan2: true },
  { id: 'agent-runtime', title: 'Agent Runtime per Ticket', description: 'Stacked agent session durations for the last 50 closed tickets', colSpan2: true },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

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
  const { currentProjectId } = useAppContext()
  const [days, setDays] = useState(30)
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching({ queryKey: ['analytics'] })
  const isAnyFetching = fetchingCount > 0

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
              colSpan2={'colSpan2' in section ? section.colSpan2 : undefined}
            >
              <SectionContent
                sectionId={section.id}
                projectId={currentProjectId ?? ''}
                days={days}
              />
            </ChartCard>
          ))}
        </div>
      </div>
    </main>
  )
}

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-8">
          <p className="text-destructive mb-2">Something went wrong rendering this chart.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

function ChartCard({
  title,
  description,
  colSpan2,
  children,
}: {
  title: string
  description?: string
  colSpan2?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={colSpan2 ? 'lg:col-span-2' : undefined}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">
        <ChartErrorBoundary>{children}</ChartErrorBoundary>
      </div>
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
    case 'ticket-burndown':
      return <TicketBurndownContent projectId={projectId} days={days} />
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
    // Temporarily disabled — see #476
    // case 'slowest-tools':
    //   return <SlowestToolsContent projectId={projectId} days={days} />
    case 'tool-calls-per-session':
      return <ToolCallsPerSessionContent projectId={projectId} days={days} />
    case 'agent-runtime':
      return <AgentRuntimeContent projectId={projectId} />
  }
}

function TicketBurndownContent({ projectId, days }: { projectId: string; days: number }) {
  const query = useTicketBurndown(projectId, days)
  const chart = useElementWidth()
  const hasData = query.data && query.data.some((d) => d.total > 0)
  const hasIdeal = query.data?.some((d) => d.ideal !== null)

  return (
    <ChartState
      query={{
        ...query,
        data: hasData ? query.data : undefined,
      }}
      emptyText={`No tickets in the last ${days} days.`}
    >
      <div ref={chart.ref} className="h-64">
        {chart.width > 0 && (
          <AreaChart data={query.data} width={chart.width} height={CHART_HEIGHT}>
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
            <Legend />
            <Area
              type="monotone"
              dataKey="open"
              name="Open"
              fill="hsl(var(--primary) / 0.2)"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="closed"
              name="Closed"
              fill="hsl(var(--primary) / 0.05)"
              stroke="hsl(var(--primary) / 0.4)"
              strokeWidth={1}
            />
            {hasIdeal && (
              <Line
                type="monotone"
                dataKey="ideal"
                name="Ideal"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                dot={false}
              />
            )}
          </AreaChart>
        )}
      </div>
    </ChartState>
  )
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
        p50: Math.round(row.p50 ?? 0),
        p90: Math.round(row.p90 ?? 0),
        p99: Math.round(row.p99 ?? 0),
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
        avg: Math.round(row.avg_duration ?? 0),
        p50: Math.round(row.p50 ?? 0),
        p90: Math.round(row.p90 ?? 0),
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

// Temporarily disabled — see #476
// function SlowestToolsContent({ projectId, days }: { projectId: string; days: number }) {
//   const query = useSlowestTools(projectId, days)
//   const chart = useElementWidth()
//   const chartData = useMemo(
//     () =>
//       query.data?.map((row) => ({
//         name: row.tool_name,
//         p50: Math.round(row.p50 ?? 0),
//         p90: Math.round(row.p90 ?? 0),
//         p99: Math.round(row.p99 ?? 0),
//       })),
//     [query.data],
//   )
//
//   return (
//     <ChartState query={query} emptyText={`No tool duration data in the last ${days} days.`}>
//       <div ref={chart.ref} className="h-64">
//         {chart.width > 0 && (
//           <BarChart
//             data={chartData}
//             layout="vertical"
//             width={chart.width}
//             height={CHART_HEIGHT}
//           >
//             <CartesianGrid
//               strokeDasharray="3 3"
//               className="stroke-border"
//               horizontal={false}
//             />
//             <XAxis
//               type="number"
//               tick={{ fontSize: 11 }}
//               tickFormatter={(v) => formatMs(v)}
//             />
//             <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
//             <Tooltip
//               formatter={(value) => formatMs(Number(value))}
//               contentStyle={tooltipStyle}
//             />
//             <Legend />
//             <Bar
//               dataKey="p50"
//               name="p50"
//               fill="hsl(var(--primary))"
//               radius={[0, 4, 4, 0]}
//             />
//             <Bar
//               dataKey="p90"
//               name="p90"
//               fill="hsl(var(--primary) / 0.6)"
//               radius={[0, 4, 4, 0]}
//             />
//             <Bar
//               dataKey="p99"
//               name="p99"
//               fill="hsl(var(--primary) / 0.3)"
//               radius={[0, 4, 4, 0]}
//             />
//           </BarChart>
//         )}
//       </div>
//     </ChartState>
//   )
// }

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

const AGENT_COLORS = [
  'hsl(221, 83%, 53%)',  // blue
  'hsl(142, 71%, 45%)',  // green
  'hsl(25, 95%, 53%)',   // orange
  'hsl(262, 83%, 58%)',  // purple
  'hsl(0, 84%, 60%)',    // red
  'hsl(47, 96%, 53%)',   // yellow
  'hsl(173, 80%, 40%)',  // teal
  'hsl(330, 81%, 60%)',  // pink
  'hsl(199, 89%, 48%)',  // sky
  'hsl(45, 93%, 47%)',   // amber
]

type SegmentMeta = { agent_name: string; run_index: number }

function useAgentRuntimeChartData(data: AgentRuntimeSegmentEntry[] | undefined) {
  return useMemo(() => {
    if (!data || data.length === 0) return null

    // Group by ticket_number preserving chronological order
    const byTicket = new Map<number, AgentRuntimeSegmentEntry[]>()
    for (const row of data) {
      let arr = byTicket.get(row.ticket_number)
      if (!arr) {
        arr = []
        byTicket.set(row.ticket_number, arr)
      }
      arr.push(row)
    }

    // Build color map for unique agent names
    const agentNames = [...new Set(data.map((r) => r.agent_name))]
    const colorMap = new Map<string, string>()
    agentNames.forEach((name, i) => {
      colorMap.set(name, AGENT_COLORS[i % AGENT_COLORS.length]!)
    })

    // Find max segments across all tickets
    let maxSegments = 0
    for (const segments of byTicket.values()) {
      maxSegments = Math.max(maxSegments, segments.length)
    }

    // Build flat data + side map
    const chartData: Record<string, unknown>[] = []
    const segmentMeta = new Map<number, SegmentMeta[]>()

    let ticketIndex = 0
    for (const [ticketNumber, segments] of byTicket) {
      const row: Record<string, unknown> = { ticket_number: `#${ticketNumber}` }
      const meta: SegmentMeta[] = []
      segments.forEach((seg, i) => {
        row[`seg_${i}`] = seg.duration_ms / 1000
        meta.push({ agent_name: seg.agent_name, run_index: seg.run_index })
      })
      chartData.push(row)
      segmentMeta.set(ticketIndex, meta)
      ticketIndex++
    }

    return { chartData, segmentMeta, maxSegments, colorMap, agentNames }
  }, [data])
}

function AgentRuntimeContent({ projectId }: { projectId: string }) {
  const query = useAgentRuntimePerTicket(projectId, 50)
  const chart = useElementWidth()
  const processed = useAgentRuntimeChartData(query.data)

  return (
    <ChartState query={query} emptyText="No closed tickets with agent sessions.">
      <div ref={chart.ref} style={{ height: CHART_HEIGHT + 40 }}>
        {chart.width > 0 && processed && (
          <BarChart
            data={processed.chartData}
            width={chart.width}
            height={CHART_HEIGHT + 40}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="ticket_number" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMs(v * 1000)} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                return (
                  <div style={tooltipStyle} className="p-2 text-sm">
                    <p className="font-medium mb-1">{label}</p>
                    {payload.map((entry) => {
                      const segIndex = Number(String(entry.dataKey).replace('seg_', ''))
                      const ticketIdx = processed.chartData.findIndex(
                        (d) => d.ticket_number === label
                      )
                      const meta = processed.segmentMeta.get(ticketIdx)?.[segIndex]
                      if (!meta || entry.value == null) return null
                      return (
                        <p key={String(entry.dataKey)} style={{ color: String(entry.color) }}>
                          {meta.agent_name}
                          {meta.run_index > 1 ? ` (run ${meta.run_index})` : ''}
                          : {formatMs(Number(entry.value) * 1000)}
                        </p>
                      )
                    })}
                  </div>
                )
              }}
            />
            <Legend />
            {processed.agentNames.map((name) => (
              <Bar
                key={`legend-${name}`}
                dataKey="_legend_placeholder"
                name={name}
                fill={processed.colorMap.get(name)}
                hide
              />
            ))}
            {Array.from({ length: processed.maxSegments }, (_, i) => (
              <Bar
                key={`seg_${i}`}
                dataKey={`seg_${i}`}
                stackId="stack"
                legendType="none"
                shape={
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ((props: any) => {
                    const meta = processed.segmentMeta.get(props.index)?.[i]
                    const fill = meta
                      ? processed.colorMap.get(meta.agent_name) ?? '#888'
                      : '#888'
                    return (
                      <Rectangle
                        x={props.x}
                        y={props.y}
                        width={props.width}
                        height={props.height}
                        fill={fill}
                      />
                    )
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }) as any
                }
              />
            ))}
          </BarChart>
        )}
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
