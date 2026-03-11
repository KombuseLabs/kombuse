import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InitProjectOptions,
  InitProjectResult,
  InitProjectFileResult,
} from '@kombuse/types'

function writeMcpJson(
  projectPath: string,
  bridgeConfig: { command: string; args: string[] }
): InitProjectFileResult {
  const filePath = join(projectPath, '.mcp.json')
  if (existsSync(filePath)) {
    return { file: '.mcp.json', action: 'skipped', reason: 'already exists' }
  }

  const content = {
    mcpServers: {
      kombuse: {
        type: 'stdio',
        command: bridgeConfig.command,
        args: bridgeConfig.args,
      },
    },
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8')
  return { file: '.mcp.json', action: 'created' }
}

function writeAgentsMd(projectPath: string): InitProjectFileResult {
  const filePath = join(projectPath, 'AGENTS.md')
  if (existsSync(filePath)) {
    return { file: 'AGENTS.md', action: 'skipped', reason: 'already exists' }
  }

  writeFileSync(filePath, '', 'utf-8')
  return { file: 'AGENTS.md', action: 'created' }
}

function createKombuseDir(projectPath: string): InitProjectFileResult {
  const dirPath = join(projectPath, '.kombuse', 'plugins')
  if (existsSync(dirPath)) {
    return { file: '.kombuse/', action: 'skipped', reason: 'already exists' }
  }

  mkdirSync(dirPath, { recursive: true })
  return { file: '.kombuse/', action: 'created' }
}

function updateGitignore(projectPath: string): InitProjectFileResult {
  const filePath = join(projectPath, '.gitignore')
  const entry = '.kombuse/'

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    if (lines.some((line) => line.trim() === entry)) {
      return { file: '.gitignore', action: 'skipped', reason: 'already contains .kombuse/' }
    }

    const suffix = content.endsWith('\n') ? '' : '\n'
    writeFileSync(filePath, content + suffix + entry + '\n', 'utf-8')
  } else {
    writeFileSync(filePath, entry + '\n', 'utf-8')
  }

  return { file: '.gitignore', action: 'created' }
}

export function initProject(
  projectPath: string,
  options?: InitProjectOptions
): InitProjectResult {
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${projectPath}`)
  }

  const files: InitProjectFileResult[] = []

  if (!options?.skipMcpJson) {
    if (options?.mcpBridgeConfig) {
      files.push(writeMcpJson(projectPath, options.mcpBridgeConfig))
    } else {
      files.push({ file: '.mcp.json', action: 'error', reason: 'bridge not found' })
    }
  }

  if (!options?.skipAgentsMd) {
    files.push(writeAgentsMd(projectPath))
  }

  if (!options?.skipKombuseDir) {
    files.push(createKombuseDir(projectPath))
  }

  if (!options?.skipGitignore) {
    files.push(updateGitignore(projectPath))
  }

  return { projectPath, files }
}
