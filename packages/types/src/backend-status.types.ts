import type { BackendType } from './agent.types'

export interface BackendStatus {
  backendType: BackendType
  available: boolean
  version: string | null
  path: string | null
  meetsMinimum: boolean
  minimumVersion: string | null
  nodeVersion: string | null
  meetsNodeMinimum: boolean
  minimumNodeVersion: string | null
}
