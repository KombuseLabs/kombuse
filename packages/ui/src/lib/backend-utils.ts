import { BACKEND_TYPES } from '@kombuse/types'

export function backendLabel(backendType: string): string {
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) return 'Claude Code'
  if (backendType === BACKEND_TYPES.CODEX) return 'Codex'
  return backendType
}
