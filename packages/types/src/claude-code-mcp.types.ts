/**
 * Effective Claude Code MCP configuration for the local user.
 */
export interface ClaudeCodeMcpStatus {
  enabled: boolean
  configured: boolean
  config_path: string
  command: string | null
  args: string[]
  bridge_path: string | null
}

/**
 * Input for enabling/disabling the local Claude Code MCP server config.
 */
export interface SetClaudeCodeMcpInput {
  enabled: boolean
}
