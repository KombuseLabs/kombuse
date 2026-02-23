export interface PluginFile {
  id: number
  plugin_id: string
  path: string
  content: string
  content_hash: string
  is_user_modified: boolean
  created_at: string
  updated_at: string
}

export interface CreatePluginFileInput {
  plugin_id: string
  path: string
  content: string
}

export interface UpdatePluginFileInput {
  content?: string
  is_user_modified?: boolean
}
