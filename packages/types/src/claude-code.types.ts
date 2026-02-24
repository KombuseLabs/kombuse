/**
 * A Claude Code project discovered by scanning ~/.claude/projects/
 */
export interface ClaudeCodeProject {
  /** Derived from the last path segment of the project path */
  name: string
  /** Absolute filesystem path (originalPath from sessions-index.json) */
  path: string
  /** ISO timestamp of the most recently modified session */
  lastAccessed: string
  /** Number of sessions in this project */
  totalSessions: number
  /** Sum of messageCount across all sessions */
  totalMessages: number
  /** Git branch from the most recent session */
  gitBranch: string | null
}

/**
 * ClaudeCodeProject annotated with import status
 */
export interface ClaudeCodeProjectWithStatus extends ClaudeCodeProject {
  /** Whether this project has already been imported into the database */
  isImported: boolean
}
