/**
 * Types for the auto-updater system.
 */

/**
 * Information about an available update from GitHub releases.
 */
export interface UpdateInfo {
  version: string
  downloadUrl: string
  checksumUrl?: string
  releaseUrl?: string
  releaseNotes: string | null
  publishedAt: string
}

/**
 * Current state of the update process.
 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'

/**
 * Full status of the auto-updater.
 */
export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  updateInfo: UpdateInfo | null
  downloadProgress: number // 0-100
  error: string | null
}

/**
 * Result of checking for updates.
 */
export interface UpdateCheckResult {
  hasUpdate: boolean
  updateInfo: UpdateInfo | null
  currentVersion: string
}

/**
 * WebSocket messages for the updates topic.
 */
export type UpdateMessage =
  | { type: 'update:status'; status: UpdateStatus }
  | { type: 'update:available'; updateInfo: UpdateInfo }
  | { type: 'update:progress'; progress: number }
  | { type: 'update:ready'; version: string }
  | { type: 'update:error'; error: string }
