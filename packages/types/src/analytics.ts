export interface SessionDurationPercentile {
  agent_id: string | null
  agent_name: string | null
  p50: number
  p90: number
  p99: number
  avg: number
  count: number
}

export interface PipelineStageDuration {
  agent_id: string
  agent_name: string
  avg_duration: number
  p50: number
  p90: number
  count: number
}
