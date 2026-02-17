import type { KombusePluginManifest } from './plugin-export'

export interface Plugin {
  id: string
  project_id: string
  name: string
  version: string
  description: string | null
  directory: string
  manifest: KombusePluginManifest
  is_enabled: boolean
  installed_at: string
  updated_at: string
}

export interface CreatePluginInput {
  id?: string
  project_id: string
  name: string
  version?: string
  description?: string
  directory: string
  manifest: string
  is_enabled?: boolean
}

export interface UpdatePluginInput {
  is_enabled?: boolean
  version?: string
  description?: string
  directory?: string
  manifest?: string
}

export interface PluginFilters {
  project_id?: string
  is_enabled?: boolean
}
