import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initProject } from '../project-init-service'

describe('initProject', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'project-init-test-'))
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true })
    }
  })

  it('should create all 4 files on a fresh directory', () => {
    const result = initProject(tempDir, {
      mcpBridgeConfig: { command: 'npx', args: ['kombuse-bridge'] },
    })

    expect(result.projectPath).toBe(tempDir)
    expect(result.files).toHaveLength(4)

    const byFile = Object.fromEntries(result.files.map((f) => [f.file, f]))
    expect(byFile['.mcp.json']!.action).toBe('created')
    expect(byFile['AGENTS.md']!.action).toBe('created')
    expect(byFile['.kombuse/']!.action).toBe('created')
    expect(byFile['.gitignore']!.action).toBe('created')

    // Verify files exist on disk
    expect(existsSync(join(tempDir, '.mcp.json'))).toBe(true)
    expect(existsSync(join(tempDir, 'AGENTS.md'))).toBe(true)
    expect(readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')).toBe('')
    expect(existsSync(join(tempDir, '.kombuse', 'plugins'))).toBe(true)
    expect(existsSync(join(tempDir, '.gitignore'))).toBe(true)

    // Verify .mcp.json content
    const mcpJson = JSON.parse(readFileSync(join(tempDir, '.mcp.json'), 'utf-8'))
    expect(mcpJson.mcpServers.kombuse.command).toBe('npx')
    expect(mcpJson.mcpServers.kombuse.args).toEqual(['kombuse-bridge'])
  })

  it('should skip all files when run a second time', () => {
    const bridgeConfig = { command: 'npx', args: ['kombuse-bridge'] }
    initProject(tempDir, { mcpBridgeConfig: bridgeConfig })

    const result = initProject(tempDir, { mcpBridgeConfig: bridgeConfig })

    expect(result.files).toHaveLength(4)
    for (const file of result.files) {
      expect(file.action, `${file.file} should be skipped`).toBe('skipped')
    }
  })

  describe('.gitignore edge cases', () => {
    it('should add newline before entry when existing gitignore has no trailing newline', () => {
      writeFileSync(join(tempDir, '.gitignore'), 'node_modules')

      initProject(tempDir, {
        mcpBridgeConfig: { command: 'x', args: [] },
        skipMcpJson: true,
        skipAgentsMd: true,
        skipKombuseDir: true,
      })

      const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8')
      expect(content).toBe('node_modules\n.kombuse/\n')
    })

    it('should create .gitignore when none exists', () => {
      initProject(tempDir, {
        mcpBridgeConfig: { command: 'x', args: [] },
        skipMcpJson: true,
        skipAgentsMd: true,
        skipKombuseDir: true,
      })

      const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8')
      expect(content).toBe('.kombuse/\n')
    })

    it('should skip when .gitignore already contains .kombuse/ entry', () => {
      writeFileSync(join(tempDir, '.gitignore'), 'node_modules\n.kombuse/\n')

      const result = initProject(tempDir, {
        mcpBridgeConfig: { command: 'x', args: [] },
      })

      const gitignoreResult = result.files.find((f) => f.file === '.gitignore')
      expect(gitignoreResult!.action).toBe('skipped')
      expect(gitignoreResult!.reason).toBe('already contains .kombuse/')
    })
  })

  describe('null bridge config', () => {
    it('should report .mcp.json as error when mcpBridgeConfig is null', () => {
      const result = initProject(tempDir, { mcpBridgeConfig: null })

      const mcpResult = result.files.find((f) => f.file === '.mcp.json')
      expect(mcpResult!.action).toBe('error')
      expect(mcpResult!.reason).toBe('bridge not found')
      expect(existsSync(join(tempDir, '.mcp.json'))).toBe(false)
    })

    it('should report .mcp.json as error when no options provided', () => {
      const result = initProject(tempDir)

      const mcpResult = result.files.find((f) => f.file === '.mcp.json')
      expect(mcpResult!.action).toBe('error')
      expect(mcpResult!.reason).toBe('bridge not found')
    })
  })

  describe('skip options', () => {
    const bridgeConfig = { command: 'x', args: [] as string[] }

    it('should skip .mcp.json when skipMcpJson is true', () => {
      const result = initProject(tempDir, { skipMcpJson: true, mcpBridgeConfig: bridgeConfig })

      expect(result.files.find((f) => f.file === '.mcp.json')).toBeUndefined()
      expect(existsSync(join(tempDir, '.mcp.json'))).toBe(false)
    })

    it('should skip AGENTS.md when skipAgentsMd is true', () => {
      const result = initProject(tempDir, { skipAgentsMd: true, mcpBridgeConfig: bridgeConfig })

      expect(result.files.find((f) => f.file === 'AGENTS.md')).toBeUndefined()
      expect(existsSync(join(tempDir, 'AGENTS.md'))).toBe(false)
    })

    it('should skip .kombuse/ when skipKombuseDir is true', () => {
      const result = initProject(tempDir, { skipKombuseDir: true, mcpBridgeConfig: bridgeConfig })

      expect(result.files.find((f) => f.file === '.kombuse/')).toBeUndefined()
      expect(existsSync(join(tempDir, '.kombuse'))).toBe(false)
    })

    it('should skip .gitignore when skipGitignore is true', () => {
      const result = initProject(tempDir, { skipGitignore: true, mcpBridgeConfig: bridgeConfig })

      expect(result.files.find((f) => f.file === '.gitignore')).toBeUndefined()
      expect(existsSync(join(tempDir, '.gitignore'))).toBe(false)
    })
  })

  describe('invalid path', () => {
    it('should throw when path does not exist', () => {
      expect(() => initProject('/nonexistent/path/12345')).toThrow(
        'Project path does not exist or is not a directory'
      )
    })

    it('should throw when path is a file, not a directory', () => {
      const filePath = join(tempDir, 'not-a-dir.txt')
      writeFileSync(filePath, 'hello')

      expect(() => initProject(filePath)).toThrow(
        'Project path does not exist or is not a directory'
      )
    })
  })
})
