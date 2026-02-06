/**
 * Session ID utilities - provides type-safe session ID handling
 *
 * Two session ID formats exist:
 * - User-initiated: `chat-{uuid}`
 * - Triggered: `trigger-{uuid}`
 *
 * Legacy format `invocation-{id}` is supported for backward compatibility.
 */

// Branded type for session IDs - provides compile-time safety
declare const KombuseSessionIdBrand: unique symbol

export type KombuseSessionId = string & {
  readonly [KombuseSessionIdBrand]: typeof KombuseSessionIdBrand
}

export type SessionOrigin = 'chat' | 'trigger'

export interface ParsedSessionId {
  origin: SessionOrigin
  uuid: string
  raw: KombuseSessionId
}

// Regex for validating session ID format
const SESSION_ID_REGEX =
  /^(chat|trigger)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

// Legacy format for backward compatibility
const LEGACY_INVOCATION_REGEX = /^invocation-(\d+)$/

/**
 * Create a new session ID with the specified origin
 */
export function createSessionId(origin: SessionOrigin): KombuseSessionId {
  const uuid = crypto.randomUUID()
  return `${origin}-${uuid}` as KombuseSessionId
}

/**
 * Validate and parse a session ID string
 * Returns null if invalid format (not a valid prefixed UUID)
 */
export function parseSessionId(id: string): ParsedSessionId | null {
  const match = id.match(SESSION_ID_REGEX)
  if (match && match[1] && match[2]) {
    return {
      origin: match[1] as SessionOrigin,
      uuid: match[2],
      raw: id as KombuseSessionId,
    }
  }
  return null
}

/**
 * Check if a string is a valid KombuseSessionId (new format)
 */
export function isValidSessionId(id: string): id is KombuseSessionId {
  return SESSION_ID_REGEX.test(id)
}

/**
 * Check if a string is a legacy invocation-style ID (for backward compatibility)
 */
export function isLegacyInvocationId(id: string): boolean {
  return LEGACY_INVOCATION_REGEX.test(id)
}

/**
 * Check if a string is an acceptable session ID (new format or legacy)
 * Use this for validation during the transition period
 */
export function isAcceptableSessionId(id: string): boolean {
  return isValidSessionId(id) || isLegacyInvocationId(id)
}

/**
 * Get the origin of a session ID, handling legacy formats
 */
export function getSessionOrigin(
  id: string
): SessionOrigin | 'legacy' | null {
  const parsed = parseSessionId(id)
  if (parsed) return parsed.origin
  if (isLegacyInvocationId(id)) return 'legacy'
  return null
}

/**
 * Assert that a string is a valid session ID (throws if invalid)
 */
export function assertSessionId(id: string): asserts id is KombuseSessionId {
  if (!isValidSessionId(id)) {
    throw new Error(
      `Invalid session ID format: ${id}. Expected format: {chat|trigger}-{uuid}`
    )
  }
}
