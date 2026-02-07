export type MentionTrigger = '@' | '#'

export interface MentionContext {
  /** Whether a mention trigger is active */
  isActive: boolean
  /** Which trigger character matched, or null if inactive */
  trigger: MentionTrigger | null
  /** The search query text after the trigger (empty string if just typed the trigger) */
  query: string
  /** Character index of the trigger in the textarea value */
  triggerIndex: number
}

const MENTION_CHAR_REGEX = /^[a-zA-Z0-9_-]*$/
const TRIGGER_CHARS: MentionTrigger[] = ['@', '#']

/**
 * Analyze textarea value at cursor position to detect a mention trigger.
 * Supports both @ (profile) and # (ticket) triggers.
 * The trigger must be at position 0 or preceded by whitespace.
 * Characters between trigger and cursor must match [a-zA-Z0-9_-]*.
 * The closest valid trigger to the cursor wins (natural mutual exclusion).
 */
export function getMentionContext(
  value: string,
  cursorPosition: number
): MentionContext {
  const inactive: MentionContext = { isActive: false, trigger: null, query: '', triggerIndex: -1 }

  if (cursorPosition <= 0) return inactive

  // Scan backward from cursor to find the nearest valid trigger
  for (let i = cursorPosition - 1; i >= 0; i--) {
    const char = value[i] as string

    const trigger = TRIGGER_CHARS.find((t) => t === char)
    if (trigger) {
      // Trigger must be at start or preceded by whitespace
      if (i > 0 && !/\s/.test(value[i - 1]!)) {
        // This trigger failed boundary check — continue scanning
        // (there may be a valid trigger further back, e.g. `foo@bar #42`)
        continue
      }

      const query = value.substring(i + 1, cursorPosition)
      if (!MENTION_CHAR_REGEX.test(query)) {
        // Invalid chars in query — continue scanning
        continue
      }

      return { isActive: true, trigger, query, triggerIndex: i }
    }

    // If we hit whitespace before finding a trigger, no active mention
    if (/\s/.test(char)) return inactive
  }

  return inactive
}

/**
 * Insert a mention into the textarea value, replacing the trigger+query portion.
 * Returns the new value and the cursor position after insertion.
 */
export function insertMention(
  value: string,
  triggerIndex: number,
  cursorPosition: number,
  replacement: string,
  triggerChar: MentionTrigger = '@'
): { newValue: string; newCursorPosition: number } {
  const before = value.substring(0, triggerIndex)
  const after = value.substring(cursorPosition)
  const mention = `${triggerChar}${replacement} `
  return {
    newValue: before + mention + after,
    newCursorPosition: before.length + mention.length,
  }
}

// Textarea style properties to copy for the mirror div
const MIRROR_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const

/**
 * Calculate pixel coordinates of the caret within a textarea using
 * the "mirror div" technique.
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const div = document.createElement('div')
  div.id = 'mention-mirror'
  document.body.appendChild(div)

  const style = div.style
  const computed = window.getComputedStyle(textarea)

  style.whiteSpace = 'pre-wrap'
  style.wordWrap = 'break-word'
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.overflow = 'hidden'

  for (const prop of MIRROR_PROPERTIES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(style as any)[prop] = (computed as any)[prop]
  }

  div.textContent = textarea.value.substring(0, position)

  const span = document.createElement('span')
  // Use zero-width space so the span has measurable height
  span.textContent = '\u200b'
  div.appendChild(span)

  const top = span.offsetTop - textarea.scrollTop
  const left = span.offsetLeft
  const height = span.offsetHeight

  document.body.removeChild(div)

  return { top, left, height }
}
