export type PluginSourceConfig =
  | { type: 'filesystem'; path: string }
  | { type: 'github'; repo: string; package_name?: string; token?: string }
  | { type: 'http'; base_url: string; token?: string }

export interface KombuseConfig {
  database?: {
    path?: string
  }
  plugins?: {
    sources?: PluginSourceConfig[]
  }
}
