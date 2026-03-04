import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import type { AgentTypePreset } from './agent-type-preset-service'

interface PermissionFileContent {
  permissions: {
    allow: string[]
    deny: string[]
  }
}

const GLOBAL_PERMISSIONS_PATH = join(homedir(), '.kombuse', 'permissions.json')

export function getProjectPermissionsPath(projectPath: string): string {
  return join(projectPath, '.kombuse', 'permissions.json')
}

/**
 * Read and validate a permissions JSON file. Returns null for missing or invalid files.
 */
export function readPermissionFile(filePath: string): PermissionFileContent | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed?.permissions && typeof parsed.permissions === 'object') {
      const allow = Array.isArray(parsed.permissions.allow)
        ? parsed.permissions.allow.filter((e: unknown) => typeof e === 'string')
        : []
      const deny = Array.isArray(parsed.permissions.deny)
        ? parsed.permissions.deny.filter((e: unknown) => typeof e === 'string')
        : []
      return { permissions: { allow, deny } }
    }
    // Invalid format — treat as empty
    return null
  } catch {
    return null
  }
}

/**
 * Parse a Claude Code-style permission entry.
 * "Bash(git *)" → { tool: 'Bash', bashPrefix: 'git' }
 * "Read" → { tool: 'Read' }
 */
export function parsePermissionEntry(entry: string): { tool: string; bashPrefix?: string } {
  const bashMatch = entry.match(/^Bash\((.+?)(?:\s+\*)?\)$/)
  if (bashMatch) {
    return { tool: 'Bash', bashPrefix: bashMatch[1] }
  }
  return { tool: entry }
}

/**
 * Format a bash command prefix as a Claude Code-style permission entry.
 * "git" → "Bash(git *)"
 */
export function formatBashEntry(prefix: string): string {
  return `Bash(${prefix} *)`
}

/**
 * Load file-based permissions (global + project) and merge with the DB-based preset.
 * deny > allow. Project file is additive on top of global.
 */
export function mergeFilePermissions(
  preset: AgentTypePreset,
  projectPath: string | undefined
): AgentTypePreset {
  const globalFile = readPermissionFile(GLOBAL_PERMISSIONS_PATH)
  const projectFile = projectPath
    ? readPermissionFile(getProjectPermissionsPath(projectPath))
    : null

  if (!globalFile && !projectFile) return preset

  const allAllows = [
    ...(globalFile?.permissions.allow ?? []),
    ...(projectFile?.permissions.allow ?? []),
  ]
  const allDenies = [
    ...(globalFile?.permissions.deny ?? []),
    ...(projectFile?.permissions.deny ?? []),
  ]

  const tools = new Set(preset.autoApprovedTools)
  const bashPrefixes = new Set(preset.autoApprovedBashCommands)

  for (const entry of allAllows) {
    const parsed = parsePermissionEntry(entry)
    if (parsed.bashPrefix) {
      bashPrefixes.add(parsed.bashPrefix)
    } else {
      tools.add(parsed.tool)
    }
  }

  // Deny always wins — remove from both tools and bash prefixes
  for (const entry of allDenies) {
    const parsed = parsePermissionEntry(entry)
    if (parsed.bashPrefix) {
      bashPrefixes.delete(parsed.bashPrefix)
    } else {
      tools.delete(parsed.tool)
    }
  }

  return {
    ...preset,
    autoApprovedTools: [...tools],
    autoApprovedBashCommands: [...bashPrefixes],
  }
}

/**
 * Append a tool or bash command to the project-level permissions file.
 * Creates the file and directory if they don't exist.
 */
export function appendToProjectPermissions(
  projectPath: string,
  toolName: string,
  input: Record<string, unknown>
): void {
  const filePath = getProjectPermissionsPath(projectPath)

  const existing = readPermissionFile(filePath) ?? {
    permissions: { allow: [], deny: [] },
  }

  let entry: string
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const prefix = input.command.trim().split(/\s+/)[0] ?? ''
    if (!prefix) return
    entry = formatBashEntry(prefix)
  } else {
    entry = toolName
  }

  if (existing.permissions.allow.includes(entry)) return

  existing.permissions.allow.push(entry)

  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')
}
