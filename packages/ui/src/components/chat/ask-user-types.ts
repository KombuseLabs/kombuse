export const AGENT_CHOICE_SENTINEL = '__agent_choice__'

export type AskUserAnswers = Record<string, string>

export interface AskUserQuestion {
  question: string
  header: string
  options: Array<{ label: string; description?: string }>
  multiSelect?: boolean
  metadata?: { confidence?: string; context?: string }
}

/** Type guard: returns true if input.questions is a valid AskUserQuestion array */
export function isValidAskUserInput(
  input: Record<string, unknown>
): input is Record<string, unknown> & { questions: AskUserQuestion[] } {
  if (!Array.isArray(input.questions)) return false
  return input.questions.every(
    (q: unknown) =>
      typeof q === 'object' &&
      q !== null &&
      'question' in q &&
      'header' in q &&
      'options' in q &&
      Array.isArray((q as AskUserQuestion).options)
  )
}
