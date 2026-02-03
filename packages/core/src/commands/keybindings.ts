/**
 * Platform detection (works in browser, SSR-safe).
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.platform)
}

/**
 * Normalize a keybinding by replacing 'mod' with the platform-specific modifier.
 * 'mod+shift+t' → 'meta+shift+t' (Mac) or 'ctrl+shift+t' (Win/Linux)
 */
export function normalizeKeybinding(kb: string): string {
  const isMac = isMacPlatform()
  return kb.toLowerCase().replace(/\bmod\b/g, isMac ? 'meta' : 'ctrl')
}

/**
 * Convert a KeyboardEvent to a normalized keybinding string.
 * Example: Cmd+Shift+T on Mac → 'meta+shift+t'
 */
export function eventToKeybinding(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('meta')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

/**
 * Format a keybinding for display.
 * 'mod+shift+t' → '⌘⇧T' (Mac) or 'Ctrl+Shift+T' (Win/Linux)
 */
export function formatKeybinding(kb: string): string {
  const isMac = isMacPlatform()
  const parts = kb.toLowerCase().split('+')

  return parts
    .map((part) => {
      switch (part) {
        case 'mod':
        case 'meta':
        case 'cmd':
          return isMac ? '⌘' : 'Ctrl'
        case 'ctrl':
          return isMac ? '⌃' : 'Ctrl'
        case 'alt':
          return isMac ? '⌥' : 'Alt'
        case 'shift':
          return isMac ? '⇧' : 'Shift'
        default:
          return part.toUpperCase()
      }
    })
    .join(isMac ? '' : '+')
}
