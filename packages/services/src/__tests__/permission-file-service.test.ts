import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  readPermissionFile,
  parsePermissionEntry,
  formatBashEntry,
  mergeFilePermissions,
  appendToProjectPermissions,
  getProjectPermissionsPath,
} from '../permission-file-service'
import type { AgentTypePreset } from '../agent-type-preset-service'

const TEST_DIR = join(tmpdir(), `kombuse-perm-test-${process.pid}`)
const PROJECT_DIR = join(TEST_DIR, 'project')
const KOMBUSE_DIR = join(PROJECT_DIR, '.kombuse')

function writePermFile(dir: string, content: unknown): string {
  const filePath = join(dir, '.kombuse', 'permissions.json')
  mkdirSync(join(dir, '.kombuse'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8')
  return filePath
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  mkdirSync(PROJECT_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('readPermissionFile', () => {
  it('returns null for a missing file', () => {
    expect(readPermissionFile('/nonexistent/permissions.json')).toBeNull()
  })

  it('reads a valid permission file', () => {
    const filePath = writePermFile(PROJECT_DIR, {
      permissions: {
        allow: ['Read', 'Bash(git *)'],
        deny: ['Bash(rm *)'],
      },
    })
    const result = readPermissionFile(filePath)
    expect(result).toEqual({
      permissions: {
        allow: ['Read', 'Bash(git *)'],
        deny: ['Bash(rm *)'],
      },
    })
  })

  it('returns null for invalid JSON', () => {
    const filePath = join(KOMBUSE_DIR, 'permissions.json')
    mkdirSync(KOMBUSE_DIR, { recursive: true })
    writeFileSync(filePath, 'not json{{{', 'utf-8')
    expect(readPermissionFile(filePath)).toBeNull()
  })

  it('returns null for a file with wrong structure', () => {
    const filePath = writePermFile(PROJECT_DIR, {
      permissions: { allow: 'not-an-array', deny: [] },
    })
    expect(readPermissionFile(filePath)).toBeNull()
  })

  it('returns null for a file missing deny array', () => {
    const filePath = writePermFile(PROJECT_DIR, {
      permissions: { allow: ['Read'] },
    })
    expect(readPermissionFile(filePath)).toBeNull()
  })
})

describe('parsePermissionEntry', () => {
  it('parses a plain tool name', () => {
    expect(parsePermissionEntry('Read')).toEqual({ tool: 'Read' })
  })

  it('parses an MCP tool name', () => {
    expect(parsePermissionEntry('mcp__kombuse__get_ticket')).toEqual({
      tool: 'mcp__kombuse__get_ticket',
    })
  })

  it('parses Bash(prefix *) format', () => {
    expect(parsePermissionEntry('Bash(git *)')).toEqual({
      tool: 'Bash',
      bashPrefix: 'git',
    })
  })

  it('parses Bash(multi-word prefix *) format', () => {
    expect(parsePermissionEntry('Bash(git status *)')).toEqual({
      tool: 'Bash',
      bashPrefix: 'git status',
    })
  })

  it('parses Bash(prefix) without wildcard', () => {
    expect(parsePermissionEntry('Bash(git)')).toEqual({
      tool: 'Bash',
      bashPrefix: 'git',
    })
  })
})

describe('formatBashEntry', () => {
  it('formats a prefix into Bash entry', () => {
    expect(formatBashEntry('git')).toBe('Bash(git *)')
  })

  it('formats a multi-word prefix', () => {
    expect(formatBashEntry('git status')).toBe('Bash(git status *)')
  })
})

describe('getProjectPermissionsPath', () => {
  it('returns the correct path', () => {
    expect(getProjectPermissionsPath('/my/project')).toBe(
      '/my/project/.kombuse/permissions.json'
    )
  })
})

describe('mergeFilePermissions', () => {
  const basePreset: AgentTypePreset = {
    autoApprovedTools: ['Read', 'Grep', 'Glob'],
    autoApprovedBashCommands: ['git status', 'ls'],
  }

  it('returns the original preset when no files exist', () => {
    const result = mergeFilePermissions(basePreset, '/nonexistent/path')
    expect(result).toBe(basePreset) // same reference — no merge needed
  })

  it('returns the original preset when projectPath is undefined', () => {
    const result = mergeFilePermissions(basePreset, undefined)
    expect(result).toBe(basePreset)
  })

  it('adds allow entries from the project file', () => {
    writePermFile(PROJECT_DIR, {
      permissions: {
        allow: ['Write', 'Bash(find *)'],
        deny: [],
      },
    })
    const result = mergeFilePermissions(basePreset, PROJECT_DIR)
    expect(result.autoApprovedTools).toContain('Write')
    expect(result.autoApprovedTools).toContain('Read') // base preserved
    expect(result.autoApprovedBashCommands).toContain('find')
    expect(result.autoApprovedBashCommands).toContain('git status') // base preserved
  })

  it('deny removes tools from base preset', () => {
    writePermFile(PROJECT_DIR, {
      permissions: {
        allow: [],
        deny: ['Read', 'Bash(ls *)'],
      },
    })
    const result = mergeFilePermissions(basePreset, PROJECT_DIR)
    expect(result.autoApprovedTools).not.toContain('Read')
    expect(result.autoApprovedTools).toContain('Grep') // other base tools preserved
    expect(result.autoApprovedBashCommands).not.toContain('ls')
    expect(result.autoApprovedBashCommands).toContain('git status') // other base preserved
  })

  it('deny overrides allow (deny > allow)', () => {
    writePermFile(PROJECT_DIR, {
      permissions: {
        allow: ['Write', 'Bash(curl *)'],
        deny: ['Write', 'Bash(curl *)'],
      },
    })
    const result = mergeFilePermissions(basePreset, PROJECT_DIR)
    expect(result.autoApprovedTools).not.toContain('Write')
    expect(result.autoApprovedBashCommands).not.toContain('curl')
  })

  it('preserves permissionMode from preset', () => {
    const presetWithMode: AgentTypePreset = {
      ...basePreset,
      permissionMode: 'plan',
    }
    writePermFile(PROJECT_DIR, {
      permissions: { allow: ['Write'], deny: [] },
    })
    const result = mergeFilePermissions(presetWithMode, PROJECT_DIR)
    expect(result.permissionMode).toBe('plan')
  })
})

describe('appendToProjectPermissions', () => {
  it('creates file and directory if they do not exist', () => {
    const freshDir = join(TEST_DIR, 'fresh-project')
    mkdirSync(freshDir, { recursive: true })
    appendToProjectPermissions(freshDir, 'Write', {})
    const filePath = getProjectPermissionsPath(freshDir)
    expect(existsSync(filePath)).toBe(true)
    const result = readPermissionFile(filePath)
    expect(result?.permissions.allow).toEqual(['Write'])
    expect(result?.permissions.deny).toEqual([])
  })

  it('appends a tool entry', () => {
    writePermFile(PROJECT_DIR, {
      permissions: { allow: ['Read'], deny: [] },
    })
    appendToProjectPermissions(PROJECT_DIR, 'Write', {})
    const result = readPermissionFile(getProjectPermissionsPath(PROJECT_DIR))
    expect(result?.permissions.allow).toEqual(['Read', 'Write'])
  })

  it('appends a Bash entry using command prefix', () => {
    writePermFile(PROJECT_DIR, {
      permissions: { allow: [], deny: [] },
    })
    appendToProjectPermissions(PROJECT_DIR, 'Bash', { command: 'find . -name "*.ts"' })
    const result = readPermissionFile(getProjectPermissionsPath(PROJECT_DIR))
    expect(result?.permissions.allow).toEqual(['Bash(find *)'])
  })

  it('skips duplicate entries', () => {
    writePermFile(PROJECT_DIR, {
      permissions: { allow: ['Read'], deny: [] },
    })
    appendToProjectPermissions(PROJECT_DIR, 'Read', {})
    const result = readPermissionFile(getProjectPermissionsPath(PROJECT_DIR))
    expect(result?.permissions.allow).toEqual(['Read'])
  })

  it('skips Bash entry with empty command', () => {
    writePermFile(PROJECT_DIR, {
      permissions: { allow: [], deny: [] },
    })
    appendToProjectPermissions(PROJECT_DIR, 'Bash', { command: '   ' })
    const result = readPermissionFile(getProjectPermissionsPath(PROJECT_DIR))
    expect(result?.permissions.allow).toEqual([])
  })
})
