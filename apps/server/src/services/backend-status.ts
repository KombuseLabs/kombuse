import { execSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { resolveClaudePath, resolveCodexPath } from '@kombuse/agent'
import { BACKEND_TYPES, type BackendType, type BackendStatus } from '@kombuse/types'

const CACHE_TTL_MS = 60_000
let cache: { statuses: BackendStatus[]; fetchedAt: number } | null = null

function isExecutableAtPath(resolvedPath: string): boolean {
  if (!resolvedPath.includes('/')) return false
  try {
    accessSync(resolvedPath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function getVersion(binaryPath: string): string | null {
  try {
    const output = execSync(`"${binaryPath}" --version`, {
      timeout: 5_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const match = output.trim().match(/(\d+\.\d+\.\d+[\w.-]*)/)
    const trimmed = output.trim()
    return match?.[1] ?? (trimmed || null)
  } catch {
    return null
  }
}

function checkSingleBackend(backendType: BackendType): BackendStatus {
  if (backendType === BACKEND_TYPES.MOCK) {
    return { backendType, available: true, version: null, path: null }
  }

  const resolvedPath =
    backendType === BACKEND_TYPES.CLAUDE_CODE
      ? resolveClaudePath()
      : resolveCodexPath()

  const isReal = isExecutableAtPath(resolvedPath)

  if (!isReal) {
    const version = getVersion(resolvedPath)
    if (version) {
      return { backendType, available: true, version, path: null }
    }
    return { backendType, available: false, version: null, path: null }
  }

  const version = getVersion(resolvedPath)
  return {
    backendType,
    available: version !== null,
    version,
    path: resolvedPath,
  }
}

export function checkAllBackendStatuses(): BackendStatus[] {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.statuses
  }

  const statuses = [
    checkSingleBackend(BACKEND_TYPES.CLAUDE_CODE),
    checkSingleBackend(BACKEND_TYPES.CODEX),
  ]

  cache = { statuses, fetchedAt: Date.now() }
  return statuses
}

export function refreshBackendStatuses(): BackendStatus[] {
  cache = null
  return checkAllBackendStatuses()
}
