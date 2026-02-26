export type PackageType = 'app' | 'plugin'

export interface PkgManifest {
  name: string
  version: string
  type: PackageType
  author?: string
  channel?: string
  description?: string
  checksum?: string
  release_notes?: string
  minRuntimeVersion?: string
  metadata?: Record<string, unknown>
}
