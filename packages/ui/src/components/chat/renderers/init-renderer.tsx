import type { SerializedAgentRawEvent } from '@kombuse/types'
import { formatEventTime } from './event-card'

export interface InitRendererProps {
  event: SerializedAgentRawEvent
}

export function InitRenderer({ event }: InitRendererProps) {
  const { timestamp, data } = event
  const d = data as Record<string, unknown> | null

  const model = d?.model as string | undefined
  const version = d?.claude_code_version as string | undefined

  const parts = ['Session initialized']
  if (model) parts.push(model)
  if (version) parts.push(`v${version}`)

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{parts.join(' · ')}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px]">{formatEventTime(timestamp)}</span>
    </div>
  )
}
