export type PluginSourceConfig =
  | { type: 'filesystem'; path: string }
  | { type: 'github'; repo: string; package_name?: string; token?: string }
  | { type: 'http'; base_url: string; token?: string }

export const BINARIES_CLAUDE_SETTING_KEY = 'binaries.claude'
export const BINARIES_CODEX_SETTING_KEY = 'binaries.codex'

export interface KombuseConfig {
  database?: {
    path?: string
  }
  plugins?: {
    sources?: PluginSourceConfig[]
  }
  binaries?: {
    claude?: string
    codex?: string
  }
}
