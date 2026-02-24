export interface InitProjectOptions {
  skipMcpJson?: boolean
  skipAgentsMd?: boolean
  skipKombuseDir?: boolean
  skipGitignore?: boolean
  mcpBridgeConfig?: McpBridgeConfig | null
}

export interface InitProjectFileResult {
  file: string
  action: 'created' | 'skipped' | 'error'
  reason?: string
}

export interface InitProjectResult {
  projectPath: string
  files: InitProjectFileResult[]
}

export interface McpBridgeConfig {
  command: string
  args: string[]
}
