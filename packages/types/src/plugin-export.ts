export interface ExportedLabel {
  name: string
  color: string
  description: string | null
}

export interface KombusePluginManifest {
  name: string
  version: string
  description?: string
  kombuse: {
    plugin_system_version: 'kombuse-plugin-v1'
    project_id: string
    exported_at: string
    labels: ExportedLabel[]
  }
}

export interface PluginExportInput {
  package_name: string
  project_id: string
  agent_ids?: string[]
  description?: string
  overwrite?: boolean
}

export interface PluginExportResult {
  package_name: string
  directory: string
  agent_count: number
  label_count: number
  files: string[]
}
