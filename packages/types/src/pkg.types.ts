export type PackageType = 'app' | 'plugin'

export interface PkgManifest {
  name: string
  version: string
  type: PackageType
  description?: string
  checksum?: string
  minRuntimeVersion?: string
  metadata?: Record<string, unknown>
}
