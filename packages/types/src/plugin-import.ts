export interface PluginInstallInput {
  package_path: string
  project_id: string
  overwrite?: boolean
}

export interface PluginInstallResult {
  plugin_id: string
  plugin_name: string
  agents_created: number
  agents_updated: number
  labels_created: number
  labels_merged: number
  triggers_created: number
  triggers_updated: number
  warnings: string[]
}

export interface AvailablePlugin {
  name: string
  version: string
  description?: string
  directory: string
  source: 'project' | 'global'
  installed: boolean
}
