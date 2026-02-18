import { BACKEND_TYPES, type BackendType } from '@kombuse/types'

export function backendLabel(backendType: string): string {
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) return 'Claude Code'
  if (backendType === BACKEND_TYPES.CODEX) return 'Codex'
  return backendType
}

export function normalizeBackendType(value?: string | null): BackendType {
  if (
    value === BACKEND_TYPES.CLAUDE_CODE
    || value === BACKEND_TYPES.CODEX
    || value === BACKEND_TYPES.MOCK
  ) {
    return value
  }
  return BACKEND_TYPES.CLAUDE_CODE
}

export function getInstallCommand(backendType: string): string {
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) {
    return 'npm install -g @anthropic-ai/claude-code'
  }
  if (backendType === BACKEND_TYPES.CODEX) {
    return 'npm install -g @openai/codex'
  }
  return ''
}

export type BackendChoice = 'global' | BackendType

export function normalizeBackendChoice(value: unknown): BackendChoice {
  if (
    value === BACKEND_TYPES.CLAUDE_CODE
    || value === BACKEND_TYPES.CODEX
    || value === BACKEND_TYPES.MOCK
  ) {
    return value
  }
  return 'global'
}
