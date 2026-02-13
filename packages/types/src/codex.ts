/**
 * Effective Codex MCP configuration for the local user.
 */
export interface CodexMcpStatus {
  enabled: boolean
  configured: boolean
  config_path: string
  command: string | null
  args: string[]
  bridge_path: string | null
}

/**
 * Input for enabling/disabling the local Codex MCP server config.
 */
export interface SetCodexMcpInput {
  enabled: boolean
}
