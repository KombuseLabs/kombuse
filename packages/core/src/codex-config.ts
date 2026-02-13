import * as TOML from '@iarna/toml'

export interface KombuseMcpSection {
  enabled: boolean
  command: string | null
  args: string[]
  configured: boolean
}

export interface KombuseMcpSectionUpdate {
  enabled: boolean
  command: string
  args: string[]
}

export const KOMBUSE_MCP_SERVER_NAME = 'kombuse'

interface UnknownRecord {
  [key: string]: unknown
}

function asRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord
  }
  return {}
}

function parseTomlSafe(content: string): UnknownRecord {
  if (!content.trim()) {
    return {}
  }
  try {
    return asRecord(TOML.parse(content))
  } catch {
    return {}
  }
}

export function parseKombuseMcpSection(content: string): KombuseMcpSection {
  const config = parseTomlSafe(content)
  const mcpServers = asRecord(config.mcp_servers)
  const kombuse = asRecord(mcpServers[KOMBUSE_MCP_SERVER_NAME])

  const command = typeof kombuse.command === 'string' ? kombuse.command : null
  const args = Array.isArray(kombuse.args)
    ? kombuse.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const enabled = kombuse.enabled === true

  return {
    enabled,
    command,
    args,
    configured: Object.keys(kombuse).length > 0,
  }
}

export function updateKombuseMcpSection(
  content: string,
  next: KombuseMcpSectionUpdate
): string {
  const config = parseTomlSafe(content)
  const mcpServers = asRecord(config.mcp_servers)
  mcpServers[KOMBUSE_MCP_SERVER_NAME] = {
    ...asRecord(mcpServers[KOMBUSE_MCP_SERVER_NAME]),
    command: next.command,
    args: next.args,
    enabled: next.enabled,
  }
  config.mcp_servers = mcpServers
  const stringifyInput = config as Parameters<typeof TOML.stringify>[0]
  return TOML.stringify(stringifyInput)
}
