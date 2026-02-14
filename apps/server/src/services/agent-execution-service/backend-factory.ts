import { ClaudeCodeBackend, CodexBackend, MockAgentClient } from '@kombuse/agent'
import { BACKEND_TYPES, type BackendType, type AgentBackend } from '@kombuse/types'
import { getCodexMcpStatus, resolveKombuseBridgeCommandConfig } from '../codex-mcp-config'

const KOMBUSE_MCP_SERVER_NAME = 'kombuse'

function isCodexMcpEnabled(): boolean {
  try {
    return getCodexMcpStatus().enabled
  } catch {
    return false
  }
}

function toTomlStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function buildCodexMcpConfigOverrides(enabled: boolean): string[] {
  const keyPrefix = `mcp_servers.${KOMBUSE_MCP_SERVER_NAME}`
  const extraArgs: string[] = [
    '-c',
    `${keyPrefix}.enabled=${enabled ? 'true' : 'false'}`,
  ]

  if (!enabled) {
    return extraArgs
  }

  // Force a known-good local kombuse MCP bridge config when available.
  const bridgeConfig = resolveKombuseBridgeCommandConfig()
  if (!bridgeConfig) {
    return extraArgs
  }

  extraArgs.push(
    '-c',
    `${keyPrefix}.command=${toTomlStringLiteral(bridgeConfig.command)}`,
    '-c',
    `${keyPrefix}.args=[${bridgeConfig.args.map((arg) => toTomlStringLiteral(arg)).join(',')}]`
  )

  return extraArgs
}

/**
 * Server-standard backend factory for all agent execution paths.
 */
export function createServerAgentBackend(backendType: BackendType): AgentBackend {
  switch (backendType) {
    case BACKEND_TYPES.CODEX: {
      const codexMcpEnabled = isCodexMcpEnabled()
      return new CodexBackend({
        extraArgs: buildCodexMcpConfigOverrides(codexMcpEnabled),
      })
    }
    case BACKEND_TYPES.MOCK:
      return new MockAgentClient()
    case BACKEND_TYPES.CLAUDE_CODE:
    default:
      return new ClaudeCodeBackend()
  }
}
