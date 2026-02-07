export interface MentionContext {
  /** Whether a mention trigger is active */
  isActive: boolean
  /** The search query text after the @ (empty string if just typed @) */
  query: string
  /** Character index of the @ trigger in the textarea value */
  triggerIndex: number
}

const MENTION_CHAR_REGEX = /^[a-zA-Z0-9_-]*$/

/**
 * Analyze textarea value at cursor position to detect @mention context.
 * The @ must be at position 0 or preceded by whitespace.
 * Characters between @ and cursor must match [a-zA-Z0-9_-]* (aligned with backend regex).
 */
export function getMentionContext(
  value: string,
  cursorPosition: number
): MentionContext {
  const inactive: MentionContext = { isActive: false, query: '', triggerIndex: -1 }

  if (cursorPosition <= 0) return inactive

  // Scan backward from cursor to find the @ trigger
  for (let i = cursorPosition - 1; i >= 0; i--) {
    const char = value[i]

    if (char === '@') {
      // @ must be at start or preceded by whitespace
      if (i > 0 && !/\s/.test(value[i - 1]!)) return inactive

      const query = value.substring(i + 1, cursorPosition)
      if (!MENTION_CHAR_REGEX.test(query)) return inactive

      return { isActive: true, query, triggerIndex: i }
    }

    // If we hit whitespace before finding @, no active mention
    if (/\s/.test(char!)) return inactive
  }

  return inactive
}

/**
 * Insert a mention into the textarea value, replacing the @query portion.
 * Returns the new value and the cursor position after insertion.
 */
export function insertMention(
  value: string,
  triggerIndex: number,
  cursorPosition: number,
  profileName: string
): { newValue: string; newCursorPosition: number } {
  const before = value.substring(0, triggerIndex)
  const after = value.substring(cursorPosition)
  const mention = `@${profileName} `
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
