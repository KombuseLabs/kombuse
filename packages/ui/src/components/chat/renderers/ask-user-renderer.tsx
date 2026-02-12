import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { HelpCircle } from 'lucide-react'
import { isValidAskUserInput } from '../ask-user-types'
import { EventCard } from './event-card'
import { PermissionRequestRenderer } from './permission-request-renderer'

export interface AskUserRendererProps {
  event: SerializedAgentPermissionRequestEvent
}

export function AskUserRenderer({ event }: AskUserRendererProps) {
  const { input, timestamp } = event
  const inputRecord = input as Record<string, unknown>

  if (!isValidAskUserInput(inputRecord)) {
    return <PermissionRequestRenderer event={event} />
  }

  const questions = inputRecord.questions

  return (
    <EventCard
      timestamp={timestamp}
      className="border border-blue-500/30 bg-blue-500/10"
      header={
        <>
          <HelpCircle className="size-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-medium uppercase text-blue-600 dark:text-blue-400">
            Question
          </span>
        </>
      }
    >
      <div className="space-y-2">
        {questions.map((q, index) => (
          <div key={index}>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                {q.header}
              </span>
              <span className="text-sm text-foreground">{q.question}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {q.options.map((opt) => (
                <span
                  key={opt.label}
                  className="rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {opt.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </EventCard>
  )
}
