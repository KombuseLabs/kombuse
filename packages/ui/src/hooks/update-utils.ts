import type { UpdateStatus } from '@kombuse/types'

/**
 * Computes the effective update status by suppressing dismissed updates.
 *
 * When a dismissed version matches the available update, returns an idle-state
 * status that preserves `currentVersion` (instead of null, which would cause
 * "Unknown" / "N/A" in the update dialog).
 */
export function computeEffectiveStatus(
  status: UpdateStatus | null,
  dismissedVersion: string | null
): UpdateStatus | null {
  if (
    dismissedVersion != null &&
    status?.state === 'available' &&
    status?.updateInfo?.version === dismissedVersion
  ) {
    return { ...status, state: 'idle' as const, updateInfo: null }
  }
  return status
}
