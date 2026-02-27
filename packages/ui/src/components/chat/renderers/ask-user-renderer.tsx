import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { HelpCircle, Check, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { isValidAskUserInput, AGENT_CHOICE_SENTINEL } from '../ask-user-types'
import { EventCard } from './event-card'
import { PermissionRequestRenderer } from './permission-request-renderer'
import { parseUserAnswers } from './permission-response-renderer'

export interface AskUserRendererProps {
  event: SerializedAgentPermissionRequestEvent
  userAnswer?: string
}

export function AskUserRenderer({ event, userAnswer }: AskUserRendererProps) {
  const { input, timestamp } = event
  const inputRecord = input as Record<string, unknown>

  if (!isValidAskUserInput(inputRecord)) {
    return <PermissionRequestRenderer event={event} />
  }

  const questions = inputRecord.questions

  // Build a header → answer lookup from the parsed answer string
  const answerMap = new Map<string, string>()
  if (userAnswer) {
    const parsed = parseUserAnswers(userAnswer)
    if (parsed) {
      for (const p of parsed) {
        answerMap.set(p.question, p.answer)
      }
    }
  }

  return (
    <EventCard
      timestamp={timestamp}
      className="border border-border bg-muted/40"
      header={
        <>
          <HelpCircle className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase text-muted-foreground">
            Question
          </span>
        </>
      }
    >
      <div className="space-y-2">
        {questions.map((q, index) => {
          const answer = answerMap.get(q.header)
          const isAgentChoice = answer === AGENT_CHOICE_SENTINEL

          return (
            <div key={index}>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {q.header}
                </span>
                <span className="text-sm text-foreground">{q.question}</span>
              </div>
              {isAgentChoice ? (
                <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs italic text-muted-foreground">
                  <Sparkles className="size-3" />
                  Agent decides
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {q.options.map((opt) => {
                    const isSelected = answer !== undefined && answer.split(', ').includes(opt.label)
                    return (
                      <span
                        key={opt.label}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          isSelected
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'bg-muted/50 text-muted-foreground'
                        )}
                      >
                        {isSelected && <Check className="mr-0.5 inline size-3" />}
                        {opt.label}
                      </span>
                    )
                  })}
                  {answer && !q.options.some((o) => answer.split(', ').includes(o.label)) && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                      <Check className="mr-0.5 inline size-3" />
                      {answer}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </EventCard>
  )
}
