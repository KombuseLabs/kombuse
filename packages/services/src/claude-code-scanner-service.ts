import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { ClaudeCodeProject } from '@kombuse/types'
import { UUID_REGEX } from '@kombuse/types'

interface SessionEntry {
  sessionId: string
  messageCount: number
  created: string
  modified: string
  gitBranch: string
  projectPath: string
}

interface SessionsIndex {
  version: number
  entries: SessionEntry[]
  originalPath: string
}

export { type SessionEntry }

export interface IClaudeCodeScanner {
  scan(): ClaudeCodeProject[]
  listSessions(projectPath: string): SessionEntry[]
  getSessionContent(projectPath: string, sessionId: string): Record<string, unknown>[]
}

export class ClaudeCodeScanner implements IClaudeCodeScanner {
  private getProjectsDir(): string {
    return join(homedir(), '.claude', 'projects')
  }

  /** Convert an absolute path to the Claude Code encoded directory name */
  private encodeProjectPath(projectPath: string): string {
    return projectPath.replace(/\//g, '-')
  }

  private getProjectDir(projectPath: string): string {
    return join(this.getProjectsDir(), this.encodeProjectPath(projectPath))
  }

  private validateProjectDir(projectPath: string): string {
    const projectDir = resolve(this.getProjectDir(projectPath))
    const projectsDir = resolve(this.getProjectsDir())
    if (!projectDir.startsWith(projectsDir + '/')) {
      throw new Error('Invalid project path')
    }
    return projectDir
  }

  listSessions(projectPath: string): SessionEntry[] {
    const projectDir = this.validateProjectDir(projectPath)
    const indexPath = join(projectDir, 'sessions-index.json')
    if (!existsSync(indexPath)) return []

    const raw = readFileSync(indexPath, 'utf-8')
    const index: SessionsIndex = JSON.parse(raw)

    if (!Array.isArray(index.entries)) return []

    return index.entries
      .filter((e) => e.sessionId && e.modified)
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
  }

  getSessionContent(projectPath: string, sessionId: string): Record<string, unknown>[] {
    if (!UUID_REGEX.test(sessionId)) {
      throw new Error('Invalid session ID format')
    }

    const projectDir = this.validateProjectDir(projectPath)
    const filePath = join(projectDir, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) {
      throw new Error(`Session file not found: ${filePath}`)
    }

    const content = readFileSync(filePath, 'utf-8')
    return content.trim().split('\n').map((line, index) => {
      try {
        return JSON.parse(line)
      } catch {
        return { _parseError: true, _lineIndex: index, _raw: line.slice(0, 200) }
      }
    })
  }

  scan(): ClaudeCodeProject[] {
    const projectsDir = this.getProjectsDir()

    if (!existsSync(projectsDir)) {
      return []
    }

    const results: ClaudeCodeProject[] = []

    let entries: string[]
    try {
      entries = readdirSync(projectsDir)
    } catch {
      return []
    }

    for (const dirName of entries) {
      const dirPath = join(projectsDir, dirName)

      try {
        if (!statSync(dirPath).isDirectory()) continue
      } catch {
        continue
      }

      const indexPath = join(dirPath, 'sessions-index.json')
      if (!existsSync(indexPath)) continue

      try {
        const raw = readFileSync(indexPath, 'utf-8')
        const index: SessionsIndex = JSON.parse(raw)

        if (!index.originalPath || !Array.isArray(index.entries)) continue

        const sessionEntries = index.entries.filter(
          (e) => e.sessionId && e.modified
        )

        if (sessionEntries.length === 0) continue

        // Find the most recent session
        const sorted = [...sessionEntries].sort(
          (a, b) =>
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        )
        const mostRecent = sorted[0]!

        results.push({
          name: basename(index.originalPath),
          path: index.originalPath,
          lastAccessed: mostRecent.modified,
          totalSessions: sessionEntries.length,
          totalMessages: sessionEntries.reduce(
            (sum, e) => sum + (e.messageCount || 0),
            0
          ),
          gitBranch: mostRecent.gitBranch || null,
        })
      } catch {
        // Skip corrupted JSON files
        continue
      }
    }

    // Sort by lastAccessed descending
    results.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() -
        new Date(a.lastAccessed).getTime()
    )

    return results
  }
}

export const claudeCodeScanner = new ClaudeCodeScanner()
