import type { SerializedAgentPermissionResponseEvent } from '@kombuse/types'
import { Check, X } from 'lucide-react'
import { formatEventTime } from './event-card'

export interface PermissionResponseRendererProps {
  event: SerializedAgentPermissionResponseEvent
  toolName?: string
  userAnswer?: string
}

/**
 * Parse the Claude Code SDK answer string format:
 * "User has answered your questions: \"Q\"=\"A\", \"Q2\"=\"A2\""
 * Returns an array of { question, answer } pairs, or null if parsing fails.
 */
function parseUserAnswers(content: string): Array<{ question: string; answer: string }> | null {
  const prefix = 'User has answered your questions: '
  if (!content.startsWith(prefix)) return null

  const pairsStr = content.slice(prefix.length)
  const pairs: Array<{ question: string; answer: string }> = []
  // Match "key"="value" pairs
  const regex = /"([^"]*)"="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(pairsStr)) !== null) {
    pairs.push({ question: match[1]!, answer: match[2]! })
  }
  return pairs.length > 0 ? pairs : null
}

export function PermissionResponseRenderer({ event, toolName, userAnswer }: PermissionResponseRendererProps) {
  const allowed = event.behavior === 'allow'

  // For AskUserQuestion with a parsed answer, show the user's selections
  if (userAnswer && toolName === 'AskUserQuestion') {
    const parsed = parseUserAnswers(userAnswer)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <Check className="size-3 text-green-600 dark:text-green-500" />
        <span className="flex items-center gap-1.5 truncate">
          <span>Answered</span>
          {parsed ? (
            parsed.map(({ question, answer }) => (
              <span key={question} className="inline-flex items-center gap-1">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{question}</span>
                <span className="text-foreground">{answer}</span>
              </span>
            ))
          ) : (
            <span className="text-foreground">{userAnswer}</span>
          )}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px]">
          {formatEventTime(event.timestamp)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      {allowed ? (
        <Check className="size-3 text-green-600 dark:text-green-500" />
      ) : (
        <X className="size-3 text-red-600 dark:text-red-500" />
      )}
      <span>
        {allowed ? 'Allowed' : 'Denied'}
        {toolName && <span className="ml-1">&middot; {toolName}</span>}
        {!allowed && event.message && (
          <span className="ml-1 italic">&ldquo;{event.message}&rdquo;</span>
        )}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10px]">
        {formatEventTime(event.timestamp)}
      </span>
    </div>
  )
}
