import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import type { ClaudeCodeProject } from '@kombuse/types'

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

export interface IClaudeCodeScanner {
  scan(): ClaudeCodeProject[]
}

export class ClaudeCodeScanner implements IClaudeCodeScanner {
  private getProjectsDir(): string {
    return join(homedir(), '.claude', 'projects')
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
