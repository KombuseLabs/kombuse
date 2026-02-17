import type { BackendType } from './agent'

export interface BackendStatus {
  backendType: BackendType
  available: boolean
  version: string | null
  path: string | null
}
