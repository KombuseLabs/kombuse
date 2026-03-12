import { spawnSync, execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { resolveClaudePath, resolveCodexPath, buildCleanPath } from '@kombuse/agent'
import { meetsMinimumVersion } from '@kombuse/pkg'
import { readBinaryPath } from '@kombuse/services'
import { BACKEND_TYPES, type BackendType, type BackendStatus } from '@kombuse/types'

export const MIN_SUPPORTED_VERSIONS: Record<string, string> = {
  'claude-code': '1.0.40',
  'codex': '0.100.0',
}

export const MIN_NODE_VERSIONS: Record<string, string> = {
  'claude-code': '20.0.0',
}

const CACHE_TTL_MS = 60_000
let cache: { statuses: BackendStatus[]; fetchedAt: number } | null = null
let cachedNodeVersion: string | null | undefined = undefined

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
    const result = spawnSync(binaryPath, ['--version'], {
      timeout: 5_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: buildCleanPath(process.env.PATH) },
    })
    const output = (result.stdout || result.stderr || '').trim()
    const match = output.match(/(\d+\.\d+\.\d+[\w.-]*)/)
    return match?.[1] ?? (output || null)
  } catch {
    return null
  }
}

function getNodeVersion(): string | null {
  try {
    const output = execFileSync('node', ['--version'], {
      timeout: 5_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: buildCleanPath(process.env.PATH) },
    })
    const match = output.trim().match(/v?(\d+\.\d+\.\d+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function resolveNodeFields(backendType: BackendType): Pick<BackendStatus, 'nodeVersion' | 'meetsNodeMinimum' | 'minimumNodeVersion'> {
  const minimumNodeVersion = MIN_NODE_VERSIONS[backendType] ?? null
  if (minimumNodeVersion === null) {
    return { nodeVersion: null, meetsNodeMinimum: true, minimumNodeVersion: null }
  }
  if (cachedNodeVersion === undefined) {
    cachedNodeVersion = getNodeVersion()
  }
  const nodeVersion = cachedNodeVersion
  const meetsNodeMinimum = nodeVersion !== null
    ? meetsMinimumVersion(nodeVersion, minimumNodeVersion)
    : true // can't determine — don't warn
  return { nodeVersion, meetsNodeMinimum, minimumNodeVersion }
}

export function checkSingleBackend(backendType: BackendType, projectId?: string): BackendStatus {
  const minimumVersion = MIN_SUPPORTED_VERSIONS[backendType] ?? null
  const nodeFields = resolveNodeFields(backendType)

  if (backendType === BACKEND_TYPES.MOCK) {
    return { backendType, available: true, version: null, path: null, meetsMinimum: true, minimumVersion: null, ...nodeFields }
  }

  const configuredPath = backendType === BACKEND_TYPES.CLAUDE_CODE
    ? readBinaryPath('claude', projectId)
    : readBinaryPath('codex', projectId)

  const resolvedPath = configuredPath
    ?? (backendType === BACKEND_TYPES.CLAUDE_CODE
      ? resolveClaudePath()
      : resolveCodexPath())

  const isReal = isExecutableAtPath(resolvedPath)

  if (isReal) {
    const version = getVersion(resolvedPath)
    const meets = version !== null && minimumVersion !== null
      ? meetsMinimumVersion(version, minimumVersion)
      : true
    return { backendType, available: true, version, path: resolvedPath, meetsMinimum: meets, minimumVersion, ...nodeFields }
  }

  // Bare-name fallback — try PATH resolution via --version
  const version = getVersion(resolvedPath)
  if (version) {
    const meets = minimumVersion !== null
      ? meetsMinimumVersion(version, minimumVersion)
      : true
    return { backendType, available: true, version, path: null, meetsMinimum: meets, minimumVersion, ...nodeFields }
  }
  return { backendType, available: false, version: null, path: null, meetsMinimum: false, minimumVersion, ...nodeFields }
}

export function checkAllBackendStatuses(projectId?: string): BackendStatus[] {
  if (!projectId && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.statuses
  }

  const statuses = [
    checkSingleBackend(BACKEND_TYPES.CLAUDE_CODE, projectId),
    checkSingleBackend(BACKEND_TYPES.CODEX, projectId),
  ]

  if (!projectId) {
    cache = { statuses, fetchedAt: Date.now() }
  }
  return statuses
}

export function refreshBackendStatuses(): BackendStatus[] {
  cache = null
  cachedNodeVersion = undefined
  return checkAllBackendStatuses()
}
