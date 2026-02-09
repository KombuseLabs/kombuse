'use client'

import { useState } from 'react'
import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { HelpCircle, Send, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'

interface AskUserQuestion {
  question: string
  header: string
  options: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

export interface AskUserBarProps {
  permission: SerializedAgentPermissionRequestEvent
  onRespond: (updatedInput: Record<string, unknown>) => void
}

export function AskUserBar({ permission, onRespond }: AskUserBarProps) {
  const questions = (permission.input.questions ?? []) as unknown as AskUserQuestion[]
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({})
  const [otherActive, setOtherActive] = useState<Record<string, boolean>>({})

  const getAnswer = (header: string): string | undefined => {
    if (otherActive[header] && otherTexts[header]?.trim()) {
      return otherTexts[header]!.trim()
    }
    const selected = selections[header]
    if (selected && selected.length > 0) {
      return selected.join(', ')
    }
    return undefined
  }

  const allAnswered = questions.every((q) => getAnswer(q.header) !== undefined)

  const handleOptionClick = (header: string, label: string, multiSelect?: boolean) => {
    setOtherActive((prev) => ({ ...prev, [header]: false }))
    setSelections((prev) => {
      const current = prev[header] ?? []
      if (multiSelect) {
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label]
        return { ...prev, [header]: next }
      }
      return { ...prev, [header]: [label] }
    })
  }

  const handleOtherClick = (header: string) => {
    setOtherActive((prev) => ({ ...prev, [header]: true }))
    setSelections((prev) => ({ ...prev, [header]: [] }))
  }

  const handleSubmit = () => {
    if (!allAnswered) return
    const answers: Record<string, string> = {}
    for (const q of questions) {
      const answer = getAnswer(q.header)
      if (answer) answers[q.header] = answer
    }
    onRespond({ ...permission.input, answers })
  }

  return (
    <div className={cn('border-t border-blue-500/30 bg-blue-500/10 p-3')}>
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />

        <div className="min-w-0 flex-1 space-y-3">
          {questions.map((q) => (
            <div key={q.header}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  {q.header}
                </span>
                <span className="text-sm text-foreground">{q.question}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const isSelected =
                    !otherActive[q.header] && (selections[q.header] ?? []).includes(opt.label)
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleOptionClick(q.header, opt.label, q.multiSelect)}
                      className={cn(
                        'group relative rounded-md border px-3 py-1.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : 'border-border bg-background text-foreground hover:border-blue-500/50 hover:bg-blue-500/5'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                        <span className="font-medium">{opt.label}</span>
                      </div>
                      {opt.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
                      )}
                    </button>
                  )
                })}

                {/* Other option */}
                <button
                  type="button"
                  onClick={() => handleOtherClick(q.header)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    otherActive[q.header]
                      ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300'
                      : 'border-border bg-background text-muted-foreground hover:border-blue-500/50 hover:bg-blue-500/5'
                  )}
                >
                  Other...
                </button>
              </div>

              {otherActive[q.header] && (
                <Input
                  value={otherTexts[q.header] ?? ''}
                  onChange={(e) =>
                    setOtherTexts((prev) => ({ ...prev, [q.header]: e.target.value }))
                  }
                  placeholder="Type your answer..."
                  className="mt-1.5 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && allAnswered) handleSubmit()
                  }}
                  autoFocus
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleSubmit}
              disabled={!allAnswered}
            >
              <Send className="mr-1 size-3" />
              Submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
