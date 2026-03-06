export interface PermissionDetail {
  /** Short label describing what kind of detail this is */
  label: string
  /** The raw detail string to display */
  value: string
}

/**
 * Extract the most relevant raw detail from a permission request's input.
 * Returns null if no meaningful detail exists or if the detail
 * would be identical to the already-displayed description.
 */
export function extractPermissionDetail(
  toolName: string,
  input: Record<string, unknown>,
  description?: string | null
): PermissionDetail | null {
  let detail: PermissionDetail | null = null

  switch (toolName) {
    case 'Bash': {
      if (typeof input.command === 'string' && input.command) {
        detail = { label: 'Command', value: input.command }
      }
      break
    }
    case 'Read':
    case 'Edit': {
      if (typeof input.file_path === 'string' && input.file_path) {
        detail = { label: 'File', value: input.file_path }
      }
      break
    }
    case 'Write': {
      if (typeof input.file_path === 'string' && input.file_path) {
        detail = { label: 'File', value: input.file_path }
      } else if (typeof input.reason === 'string' && input.reason) {
        const path = typeof input.grantRoot === 'string' ? input.grantRoot : null
        detail = { label: 'Reason', value: path ? `${input.reason} (${path})` : input.reason }
      }
      break
    }
    case 'Grep':
    case 'Glob': {
      if (typeof input.pattern === 'string' && input.pattern) {
        const path = typeof input.path === 'string' ? input.path : null
        detail = {
          label: 'Pattern',
          value: path ? `${input.pattern} in ${path}` : input.pattern,
        }
      }
      break
    }
    case 'WebFetch': {
      if (typeof input.url === 'string' && input.url) {
        detail = { label: 'URL', value: input.url }
      }
      break
    }
    case 'ExitPlanMode':
    case 'AskUserQuestion': {
      return null
    }
  }

  // Fallback: show JSON of input (minus description) for unknown tools
  if (!detail) {
    const { description: _desc, ...rest } = input
    if (Object.keys(rest).length > 0) {
      detail = { label: 'Input', value: JSON.stringify(rest, null, 2) }
    }
  }

  // Don't show detail if it's identical to the description
  if (detail && description && detail.value.trim() === description.trim()) {
    return null
  }

  return detail
}
