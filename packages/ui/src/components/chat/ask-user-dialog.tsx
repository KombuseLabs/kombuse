'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { HelpCircle, Send, Check, ChevronLeft, ChevronRight, Sparkles, SkipForward } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../base/dialog'
import { type AskUserQuestion, type AskUserAnswers, AGENT_CHOICE_SENTINEL, isValidAskUserInput } from './ask-user-types'

export interface AskUserDialogProps {
  permission: SerializedAgentPermissionRequestEvent | null
  onRespond: (updatedInput: Record<string, unknown>) => void
  onDeny: () => void
}

export function AskUserDialog({ permission, onRespond, onDeny }: AskUserDialogProps) {
  const [selections, setSelections] = useState<Map<number, string[]>>(new Map())
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(new Map())
  const [otherActive, setOtherActive] = useState<Map<number, boolean>>(new Map())
  const [currentStep, setCurrentStep] = useState(0)
  const [showConfirmDismiss, setShowConfirmDismiss] = useState(false)

  const input = permission?.input as Record<string, unknown> | undefined
  const isValid = input ? isValidAskUserInput(input) : false
  const questions: AskUserQuestion[] = isValid ? (input as { questions: AskUserQuestion[] }).questions : []
  const isWizardMode = questions.length >= 3
  const isReviewStep = isWizardMode && currentStep === questions.length

  // Reset state when permission changes
  useEffect(() => {
    setSelections(new Map())
    setOtherTexts(new Map())
    setOtherActive(new Map())
    setCurrentStep(0)
    setShowConfirmDismiss(false)
  }, [permission?.requestId])

  const getAnswer = useCallback((index: number): string | undefined => {
    if (otherActive.get(index) && otherTexts.get(index)?.trim()) {
      return otherTexts.get(index)!.trim()
    }
    const selected = selections.get(index)
    if (selected && selected.length > 0) {
      return selected.join(', ')
    }
    return undefined
  }, [selections, otherTexts, otherActive])

  const isAnswered = useCallback((index: number): boolean => {
    return getAnswer(index) !== undefined
  }, [getAnswer])

  const allAnswered = questions.every((_, i) => isAnswered(i))
  const hasAnyAnswer = questions.some((_, i) => isAnswered(i))

  const buildAnswers = (): AskUserAnswers => {
    const answers: AskUserAnswers = {}
    for (let i = 0; i < questions.length; i++) {
      const answer = getAnswer(i)
      if (answer) answers[questions[i]!.header] = answer
    }
    return answers
  }

  const handleOptionClick = (index: number, label: string, multiSelect?: boolean) => {
    setOtherActive((prev) => new Map(prev).set(index, false))
    setSelections((prev) => {
      const next = new Map(prev)
      const current = prev.get(index) ?? []
      if (multiSelect) {
        const updated = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current.filter((l) => l !== AGENT_CHOICE_SENTINEL), label]
        next.set(index, updated)
      } else {
        next.set(index, [label])
      }
      return next
    })
  }

  const handleOtherClick = (index: number) => {
    setOtherActive((prev) => new Map(prev).set(index, true))
    setSelections((prev) => new Map(prev).set(index, []))
  }

  const handleAgentChoice = (index: number) => {
    setOtherActive((prev) => new Map(prev).set(index, false))
    setSelections((prev) => new Map(prev).set(index, [AGENT_CHOICE_SENTINEL]))
  }

  const handleSkipAll = () => {
    const newSelections = new Map(selections)
    for (let i = 0; i < questions.length; i++) {
      if (!isAnswered(i)) {
        newSelections.set(i, [AGENT_CHOICE_SENTINEL])
        setOtherActive((prev) => new Map(prev).set(i, false))
      }
    }
    setSelections(newSelections)
    if (isWizardMode) setCurrentStep(questions.length)
  }

  const handleSubmit = () => {
    if (!allAnswered || !permission) return
    const answers = buildAnswers()
    onRespond({ ...permission.input, answers })
  }

  const handleDismiss = () => {
    if (hasAnyAnswer) {
      setShowConfirmDismiss(true)
    } else {
      onDeny()
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) handleDismiss()
  }

  const isAgentChoiceAnswer = (index: number): boolean => {
    const sel = selections.get(index)
    return sel?.length === 1 && sel[0] === AGENT_CHOICE_SENTINEL
  }

  // Render a single question's options
  function QuestionCard({ question, index }: { question: AskUserQuestion; index: number }) {
    const isAgent = isAgentChoiceAnswer(index)

    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {question.header}
          </span>
          <span className="text-sm text-foreground">{question.question}</span>
        </div>

        {question.metadata?.context && (
          <p className="mb-1.5 text-xs text-muted-foreground">{question.metadata.context}</p>
        )}

        {question.metadata?.confidence && (
          <p className="mb-1.5 text-xs italic text-amber-600 dark:text-amber-500">
            {question.metadata.confidence}
          </p>
        )}

        {isAgent ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground italic">
            <Sparkles className="size-3" />
            Agent decides
            <button
              type="button"
              onClick={() => setSelections((prev) => new Map(prev).set(index, []))}
              className="ml-auto text-xs underline hover:text-foreground"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((opt) => {
                const isSelected =
                  !otherActive.get(index) && (selections.get(index) ?? []).includes(opt.label)
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleOptionClick(index, opt.label, question.multiSelect)}
                    className={cn(
                      'group relative rounded-md border px-3 py-1.5 text-left text-sm transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {isSelected && <Check className="size-3 text-primary" />}
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
                onClick={() => handleOtherClick(index)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  otherActive.get(index)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                Other...
              </button>

              {/* Your call option */}
              <button
                type="button"
                onClick={() => handleAgentChoice(index)}
                className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="size-3" />
                  Your call
                </span>
              </button>
            </div>

            {otherActive.get(index) && (
              <Input
                value={otherTexts.get(index) ?? ''}
                onChange={(e) =>
                  setOtherTexts((prev) => new Map(prev).set(index, e.target.value))
                }
                placeholder="Type your answer..."
                className="mt-1.5 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (isWizardMode) {
                      if (isAnswered(index) && currentStep < questions.length) {
                        setCurrentStep((s) => s + 1)
                      }
                    } else if (allAnswered) {
                      handleSubmit()
                    }
                  }
                }}
                autoFocus
              />
            )}
          </>
        )}
      </div>
    )
  }

  // Render review step (wizard mode)
  function ReviewStep() {
    return (
      <div className="space-y-2">
        {questions.map((q, index) => {
          const answer = getAnswer(index)
          const isAgent = isAgentChoiceAnswer(index)
          return (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentStep(index)}
              className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {q.header}
                </span>
                <span className="text-sm text-muted-foreground">{q.question}</span>
              </div>
              {answer ? (
                <span
                  className={cn(
                    'ml-2 shrink-0 text-sm',
                    isAgent ? 'flex items-center gap-1 italic text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {isAgent ? (
                    <>
                      <Sparkles className="size-3" />
                      Agent decides
                    </>
                  ) : (
                    answer
                  )}
                </span>
              ) : (
                <span className="ml-2 shrink-0 text-sm text-destructive">Not answered</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  if (!permission || !isValid) return null

  return (
    <Dialog open={!!permission} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn('flex max-h-[80vh] flex-col', isWizardMode ? 'sm:max-w-xl' : 'sm:max-w-lg')}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          if (showConfirmDismiss) {
            setShowConfirmDismiss(false)
            return
          }
          if (isWizardMode && currentStep > 0) {
            setCurrentStep((s) => s - 1)
          } else {
            handleDismiss()
          }
        }}
        onInteractOutside={(e) => {
          if (hasAnyAnswer) {
            e.preventDefault()
            setShowConfirmDismiss(true)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="size-4 text-muted-foreground" />
            {isReviewStep ? 'Review Answers' : 'Question'}
          </DialogTitle>
          <DialogDescription>
            {isWizardMode
              ? isReviewStep
                ? 'Review your answers before submitting. Click any to edit.'
                : `Step ${currentStep + 1} of ${questions.length}`
              : `${questions.length} question${questions.length === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>

        {showConfirmDismiss ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-muted-foreground">Discard your answers?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => onDeny()}>
                Discard
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowConfirmDismiss(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
            {isReviewStep ? (
              <ReviewStep />
            ) : isWizardMode ? (
              <QuestionCard question={questions[currentStep]!} index={currentStep} />
            ) : (
              questions.map((q, index) => (
                <QuestionCard key={index} question={q} index={index} />
              ))
            )}
          </div>
        )}

        {!showConfirmDismiss && (
          <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
            <div className="flex items-center gap-2">
              {isWizardMode && currentStep > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentStep((s) => s - 1)}
                >
                  <ChevronLeft className="mr-1 size-3" />
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isReviewStep && !allAnswered && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSkipAll}
                  className="text-muted-foreground"
                >
                  <SkipForward className="mr-1 size-3" />
                  Skip all — agent decides
                </Button>
              )}

              {isWizardMode && !isReviewStep ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  disabled={!isAnswered(currentStep)}
                >
                  Next
                  <ChevronRight className="ml-1 size-3" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                >
                  <Send className="mr-1 size-3" />
                  Submit
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
