export const KOMBUSE_MCP_SERVER_NAME = 'kombuse'

export interface ClaudeCodeMcpSection {
  enabled: boolean
  command: string | null
  args: string[]
  configured: boolean
}

export interface ClaudeCodeMcpSectionUpdate {
  enabled: boolean
  command: string
  args: string[]
}

interface McpServerEntry {
  type?: string
  command?: string
  args?: unknown[]
  [key: string]: unknown
}

interface SettingsJson {
  mcpServers?: Record<string, McpServerEntry>
  [key: string]: unknown
}

function parseJsonSafe(content: string): SettingsJson {
  if (!content.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SettingsJson
    }
    return {}
  } catch {
    return {}
  }
}

export function parseClaudeCodeMcpSection(content: string): ClaudeCodeMcpSection {
  const config = parseJsonSafe(content)
  const mcpServers = config.mcpServers ?? {}
  const kombuse = mcpServers[KOMBUSE_MCP_SERVER_NAME]

  if (!kombuse || typeof kombuse !== 'object') {
    return {
      enabled: false,
      command: null,
      args: [],
      configured: false,
    }
  }

  const command = typeof kombuse.command === 'string' ? kombuse.command : null
  const args = Array.isArray(kombuse.args)
    ? kombuse.args.filter((arg): arg is string => typeof arg === 'string')
    : []

  return {
    enabled: command !== null,
    command,
    args,
    configured: true,
  }
}

export function updateClaudeCodeMcpSection(
  content: string,
  next: ClaudeCodeMcpSectionUpdate
): string {
  const config = parseJsonSafe(content)

  if (!config.mcpServers) {
    config.mcpServers = {}
  }

  if (next.enabled) {
    config.mcpServers[KOMBUSE_MCP_SERVER_NAME] = {
      type: 'stdio',
      command: next.command,
      args: next.args,
    }
  } else {
    delete config.mcpServers[KOMBUSE_MCP_SERVER_NAME]
  }

  return JSON.stringify(config, null, 2) + '\n'
}
