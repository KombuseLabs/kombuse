import type { AgentBackend } from '@kombuse/types'
import { readUserBackendIdleTimeoutMinutes } from '@kombuse/services'

/**
 * Registry of active session backends for permission response routing.
 * Backends are kept alive after successful completion for persistent reuse.
 */
export const activeBackends = new Map<string, AgentBackend>()

/** Idle timeout handles for persistent backends. */
export const backendIdleTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/** Sessions that are actively processing a turn. */
export const activeSessionTurns = new Set<string>()

/** Default idle timeout: 30 minutes. */
const DEFAULT_BACKEND_IDLE_TIMEOUT_MS = 30 * 60 * 1000

function parseBackendIdleTimeoutMs(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BACKEND_IDLE_TIMEOUT_MS
  }
  return parsed
}

export const BACKEND_IDLE_TIMEOUT_MS = parseBackendIdleTimeoutMs(
  process.env.KOMBUSE_BACKEND_IDLE_TIMEOUT_MS
)

export function resolveBackendIdleTimeoutMs(): number | null {
  const userMinutes = readUserBackendIdleTimeoutMinutes()
  if (userMinutes === null) return null
  if (userMinutes !== undefined) return userMinutes * 60 * 1000
  return BACKEND_IDLE_TIMEOUT_MS
}

export function setSessionTurnActive(sessionId: string, isActive: boolean): void {
  if (isActive) {
    activeSessionTurns.add(sessionId)
    return
  }
  activeSessionTurns.delete(sessionId)
}

export function isSessionTurnActive(sessionId: string): boolean {
  return activeSessionTurns.has(sessionId)
}

/**
 * Server-side tracking of pending (unresolved) permission requests.
 * Keyed by permissionKey (`${sessionId}:${requestId}`). Populated when a permission is broadcast to clients,
 * removed when resolved or when the backend is unregistered.
 */
export interface ServerPendingPermission {
  permissionKey: string
  sessionId: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description: string
  ticketId?: number
  projectId?: string
}

export const serverPendingPermissions = new Map<string, ServerPendingPermission>()

export function createPermissionKey(sessionId: string, requestId: string): string {
  return `${sessionId}:${requestId}`
}

export function clearPendingPermissionsForSession(sessionId: string): void {
  for (const [permissionKey, permission] of serverPendingPermissions) {
    if (permission.sessionId === sessionId) {
      serverPendingPermissions.delete(permissionKey)
    }
  }
}
