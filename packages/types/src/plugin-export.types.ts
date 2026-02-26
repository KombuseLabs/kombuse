export interface ExportedLabel {
  name: string
  color: string
  description: string | null
}

export interface KombusePluginManifest {
  name: string
  version: string
  author?: string
  description?: string
  kombuse: {
    plugin_system_version: 'kombuse-plugin-v1'
    exported_at: string
    labels: ExportedLabel[]
  }
}

export interface PluginExportInput {
  package_name: string
  project_id: string
  author?: string
  version?: string
  agent_ids?: string[]
  description?: string
  overwrite?: boolean
  archive_format?: 'tar.gz'
}

export interface PluginExportResult {
  package_name: string
  directory: string
  agent_count: number
  label_count: number
  file_count: number
  files: string[]
  archive?: {
    path: string
    checksum: string
    size: number
  }
}

export interface PluginPublishInput {
  package_name: string
  project_id: string
  author: string
  registry_url: string
  token: string
  agent_ids?: string[]
  channel?: string
  version?: string
  description?: string
  overwrite?: boolean
}

export interface PluginPublishResult {
  author: string
  name: string
  version: string
  channel: string
  download_url: string
}
