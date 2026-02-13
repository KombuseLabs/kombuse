import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { getCodexMcpStatus, setCodexMcpEnabled } from '../services/codex-mcp-config'

function withCodexHome(tempHome: string, run: () => void): void {
  const previous = process.env.CODEX_HOME
  process.env.CODEX_HOME = tempHome
  try {
    run()
  } finally {
    if (previous === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previous
    }
  }
}

describe('codex-mcp-config', () => {
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
    const tempHome = mkdtempSync(join(tmpdir(), 'codex-home-'))
    tempRoots.push(tempHome)

    withCodexHome(tempHome, () => {
      const status = getCodexMcpStatus()

      expect(status.configured).toBe(false)
      expect(status.enabled).toBe(false)
      expect(status.config_path).toBe(join(tempHome, 'config.toml'))
    })
  })

  it('writes and enables kombuse MCP config in local codex config', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'codex-home-'))
    tempRoots.push(tempHome)

    withCodexHome(tempHome, () => {
      const status = setCodexMcpEnabled(true)
      const configText = readFileSync(status.config_path, 'utf-8')

      expect(status.enabled).toBe(true)
      expect(status.configured).toBe(true)
      expect(configText).toContain('[mcp_servers.kombuse]')
      expect(configText).toContain('enabled = true')
      expect(configText).toMatch(/command = ".*bun"/)
    })
  })

  it('disables kombuse MCP config while keeping the section present', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'codex-home-'))
    tempRoots.push(tempHome)

    withCodexHome(tempHome, () => {
      setCodexMcpEnabled(true)
      const status = setCodexMcpEnabled(false)
      const configText = readFileSync(status.config_path, 'utf-8')

      expect(status.enabled).toBe(false)
      expect(status.configured).toBe(true)
      expect(configText).toContain('[mcp_servers.kombuse]')
      expect(configText).toContain('enabled = false')
    })
  })

  it('uses node command when bridge path points to an mjs script', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'codex-home-'))
    const bridgeRoot = mkdtempSync(join(tmpdir(), 'kombuse-bridge-'))
    tempRoots.push(tempHome, bridgeRoot)

    const bridgePath = join(bridgeRoot, 'mcp-bridge.mjs')
    writeFileSync(bridgePath, "console.log('bridge')\n", 'utf-8')
    process.env.KOMBUSE_MCP_BRIDGE_PATH = bridgePath

    withCodexHome(tempHome, () => {
      const status = setCodexMcpEnabled(true)
      expect(status.command).toBe('node')
      expect(status.args).toEqual([bridgePath])
      expect(status.bridge_path).toBe(bridgePath)
    })
  })
})
