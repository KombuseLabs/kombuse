import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { parseClaudeCodeMcpSection, updateClaudeCodeMcpSection } from '@kombuse/core/claude-code-mcp-config'
import { resolveKombuseBridgeCommandConfig } from './codex-mcp-config'
import type { ClaudeCodeMcpStatus } from '@kombuse/types'

function getClaudeCodeConfigPath(): string {
  const claudeHome = process.env.CLAUDE_HOME?.trim() || join(homedir(), '.claude')
  return join(claudeHome, 'settings.json')
}

function readConfigFile(path: string): string {
  if (!existsSync(path)) {
    return ''
  }
  return readFileSync(path, 'utf-8')
}

function writeConfigFile(configPath: string, content: string): void {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, content, 'utf-8')
}

export function getClaudeCodeMcpStatus(): ClaudeCodeMcpStatus {
  const configPath = getClaudeCodeConfigPath()
  const fileContent = readConfigFile(configPath)
  const parsed = parseClaudeCodeMcpSection(fileContent)
  const bridgeConfig = resolveKombuseBridgeCommandConfig()

  return {
    enabled: parsed.enabled,
    configured: parsed.configured,
    config_path: configPath,
    command: parsed.command,
    args: parsed.args,
    bridge_path: bridgeConfig?.bridgePath ?? null,
  }
}

export function setClaudeCodeMcpEnabled(enabled: boolean): ClaudeCodeMcpStatus {
  const status = getClaudeCodeMcpStatus()
  const bridgeConfig = resolveKombuseBridgeCommandConfig()

  if (enabled && !bridgeConfig) {
    throw new Error(
      'Could not locate Kombuse MCP bridge script on this machine.'
    )
  }

  const command = bridgeConfig?.command ?? status.command ?? 'node'
  const args = bridgeConfig?.args
    ?? (status.args.length > 0
      ? status.args
      : ['run', 'apps/server/src/mcp-bridge.ts'])

  const existing = readConfigFile(status.config_path)
  const nextContent = updateClaudeCodeMcpSection(existing, {
    enabled,
    command,
    args,
  })
  writeConfigFile(status.config_path, nextContent)

  return getClaudeCodeMcpStatus()
}
