import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { getClaudeCodeMcpStatus, setClaudeCodeMcpEnabled } from '../services/claude-code-mcp-config'

function withClaudeHome(tempHome: string, run: () => void): void {
  const previous = process.env.CLAUDE_HOME
  process.env.CLAUDE_HOME = tempHome
  try {
    run()
  } finally {
    if (previous === undefined) {
      delete process.env.CLAUDE_HOME
    } else {
      process.env.CLAUDE_HOME = previous
    }
  }
}

describe('claude-code-mcp-config', () => {
  const tempRoots: string[] = []
  const previousBridgePathEnv = process.env.KOMBUSE_MCP_BRIDGE_PATH

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
    if (previousBridgePathEnv === undefined) {
      delete process.env.KOMBUSE_MCP_BRIDGE_PATH
    } else {
      process.env.KOMBUSE_MCP_BRIDGE_PATH = previousBridgePathEnv
    }
  })

  it('reports not configured when config file does not exist', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'claude-home-'))
    tempRoots.push(tempHome)

    withClaudeHome(tempHome, () => {
      const status = getClaudeCodeMcpStatus()

      expect(status.configured).toBe(false)
      expect(status.enabled).toBe(false)
      expect(status.config_path).toBe(join(tempHome, 'settings.local.json'))
    })
  })

  it('writes and enables kombuse MCP config in local claude code config', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'claude-home-'))
    tempRoots.push(tempHome)

    withClaudeHome(tempHome, () => {
      const status = setClaudeCodeMcpEnabled(true)
      const configText = readFileSync(status.config_path, 'utf-8')
      const config = JSON.parse(configText)

      expect(status.enabled).toBe(true)
      expect(status.configured).toBe(true)
      expect(config.mcpServers.kombuse).toBeDefined()
      expect(config.mcpServers.kombuse.type).toBe('stdio')
      expect(typeof config.mcpServers.kombuse.command).toBe('string')
      expect(Array.isArray(config.mcpServers.kombuse.args)).toBe(true)
    })
  })

  it('disables kombuse MCP config by removing the entry', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'claude-home-'))
    tempRoots.push(tempHome)

    withClaudeHome(tempHome, () => {
      setClaudeCodeMcpEnabled(true)
      const status = setClaudeCodeMcpEnabled(false)
      const configText = readFileSync(status.config_path, 'utf-8')
      const config = JSON.parse(configText)

      expect(status.enabled).toBe(false)
      expect(status.configured).toBe(false)
      expect(config.mcpServers.kombuse).toBeUndefined()
    })
  })

  it('uses node command when bridge path points to an mjs script', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'claude-home-'))
    const bridgeRoot = mkdtempSync(join(tmpdir(), 'kombuse-bridge-'))
    tempRoots.push(tempHome, bridgeRoot)

    const bridgePath = join(bridgeRoot, 'mcp-bridge.mjs')
    writeFileSync(bridgePath, "console.log('bridge')\n", 'utf-8')
    process.env.KOMBUSE_MCP_BRIDGE_PATH = bridgePath

    withClaudeHome(tempHome, () => {
      const status = setClaudeCodeMcpEnabled(true)
      expect(status.command).toBe('node')
      expect(status.args).toEqual([bridgePath])
      expect(status.bridge_path).toBe(bridgePath)
    })
  })
})
