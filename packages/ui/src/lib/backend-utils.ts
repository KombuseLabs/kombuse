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
    return 'curl -fsSL https://claude.ai/install.sh | bash'
  }
  if (backendType === BACKEND_TYPES.CODEX) {
    return 'npm install -g @openai/codex'
  }
  return ''
}

export function getUpdateCommand(backendType: string): string {
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) {
    return 'claude update'
  }
  return getInstallCommand(backendType)
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
