import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseKombuseMcpSection, updateKombuseMcpSection } from '@kombuse/core/codex-config'
import type { CodexMcpStatus } from '@kombuse/types'

const PACKAGED_BRIDGE_PATH = '/Applications/Kombuse.app/Contents/Resources/package/server/mcp-bridge.mjs'
const SERVICE_DIR = dirname(fileURLToPath(import.meta.url))

interface BridgeCommandConfig {
  command: string
  args: string[]
  bridgePath: string
}

function getCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  return join(codexHome, 'config.toml')
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function getAncestorDirectories(start: string, levels: number): string[] {
  const dirs: string[] = []
  let current = start
  for (let i = 0; i <= levels; i += 1) {
    dirs.push(current)
    const parent = resolvePath(current, '..')
    if (parent === current) {
      break
    }
    current = parent
  }
  return dirs
}

function getBridgePathCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const cwd = process.cwd()
  const explicitPath = process.env.KOMBUSE_MCP_BRIDGE_PATH?.trim()
  const cwdAncestors = getAncestorDirectories(cwd, 6)

  const ancestorWorkspaceCandidates = cwdAncestors.flatMap((dir) => [
    resolvePath(dir, 'apps', 'server', 'src', 'mcp-bridge.ts'),
    resolvePath(dir, 'apps', 'server', 'dist', 'mcp-bridge.js'),
    resolvePath(dir, 'server', 'src', 'mcp-bridge.ts'),
    resolvePath(dir, 'server', 'dist', 'mcp-bridge.js'),
  ])

  const candidates = [
    explicitPath || null,
    // Bundled/installed package layout (bundle.mjs + mcp-bridge.mjs in same dir)
    resolvePath(SERVICE_DIR, 'mcp-bridge.mjs'),
    // Source tree layouts (dev/server workspace)
    resolvePath(SERVICE_DIR, '..', 'mcp-bridge.ts'),
    resolvePath(SERVICE_DIR, '..', 'mcp-bridge.js'),
    resolvePath(SERVICE_DIR, '..', '..', 'src', 'mcp-bridge.ts'),
    resolvePath(cwd, 'src', 'mcp-bridge.ts'),
    resolvePath(cwd, 'apps/server/src/mcp-bridge.ts'),
    // Preview/package paths
    resolvePath(cwd, 'dist/package/server/mcp-bridge.mjs'),
    resolvePath(cwd, 'apps/desktop/dist/package/server/mcp-bridge.mjs'),
    resolvePath(cwd, 'package/server/mcp-bridge.mjs'),
    ...ancestorWorkspaceCandidates,
    resolvePath(homedir(), '.kombuse', 'packages', 'current', 'server', 'mcp-bridge.mjs'),
    // Electron packaged app paths
    resourcesPath ? resolvePath(resourcesPath, 'package', 'server', 'mcp-bridge.mjs') : null,
    resourcesPath
      ? resolvePath(resourcesPath, 'app.asar.unpacked', 'package', 'server', 'mcp-bridge.mjs')
      : null,
    resolvePath(process.execPath, '..', '..', 'Resources', 'package', 'server', 'mcp-bridge.mjs'),
    PACKAGED_BRIDGE_PATH,
  ]

  const unique: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue
    }
    seen.add(candidate)
    unique.push(candidate)
  }
  return unique
}

function resolveBunCommand(): string {
  const candidates = [
    process.env.BUN,
    process.env.BUN_PATH,
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin', 'bun') : null,
    join(homedir(), '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ]

  for (const candidate of candidates) {
    if (candidate && isFile(candidate)) {
      return candidate
    }
  }

  return 'bun'
}

function resolveBridgeInvocation(path: string): Pick<BridgeCommandConfig, 'command' | 'args'> {
  if (path.endsWith('.mjs') || path.endsWith('.js')) {
    return {
      command: 'node',
      args: [path],
    }
  }

  return {
    command: resolveBunCommand(),
    args: ['run', path],
  }
}

export function resolveKombuseBridgeCommandConfig(): BridgeCommandConfig | null {
  for (const candidatePath of getBridgePathCandidates()) {
    if (isFile(candidatePath)) {
      const invocation = resolveBridgeInvocation(candidatePath)
      return {
        command: invocation.command,
        args: invocation.args,
        bridgePath: candidatePath,
      }
    }
  }

  return null
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

export function getCodexMcpStatus(): CodexMcpStatus {
  const configPath = getCodexConfigPath()
  const fileContent = readConfigFile(configPath)
  const parsed = parseKombuseMcpSection(fileContent)
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

export function setCodexMcpEnabled(enabled: boolean): CodexMcpStatus {
  const status = getCodexMcpStatus()
  const bridgeConfig = resolveKombuseBridgeCommandConfig()
  const bridgeCandidates = getBridgePathCandidates()

  if (enabled && !bridgeConfig) {
    throw new Error(
      `Could not locate Kombuse MCP bridge script on this machine. Tried:\n${bridgeCandidates.join('\n')}`
    )
  }

  const command = bridgeConfig?.command ?? status.command ?? resolveBunCommand()
  const args = bridgeConfig?.args
    ?? (status.args.length > 0
      ? status.args
      : ['run', 'apps/server/src/mcp-bridge.ts'])

  const existing = readConfigFile(status.config_path)
  const nextContent = updateKombuseMcpSection(existing, {
    enabled,
    command,
    args,
  })
  writeConfigFile(status.config_path, nextContent)

  return getCodexMcpStatus()
}
