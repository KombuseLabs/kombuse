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

export interface ToolReadFrequency {
  file_path: string
  read_count: number
}

export interface ToolCallsPerSession {
  session_id: string
  agent_id: string | null
  agent_name: string
  call_count: number
}

export interface ToolDurationPercentile {
  tool_name: string
  count: number
  avg: number
  p50: number
  p90: number
  p99: number
}

export interface ToolCallVolume {
  tool_name: string
  call_count: number
  session_count: number
}

export interface BurndownEntry {
  date: string
  total: number
  open: number
  closed: number
  ideal: number | null
}
