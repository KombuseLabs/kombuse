import { execSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import type { ProcessBehavior, Process } from '../../types'
import type { ClaudeEvent } from './types'
import { createAppLogger } from '@kombuse/core/logger'
import { resolveViaLoginShell } from '../../env-utils'

const logger = createAppLogger('ClaudeCodeUtils')

/**
 * Parsed message from Claude CLI with optional PID for control requests
 */
export interface ParsedClaudeMessage {
  data: ClaudeEvent
  pid?: number
}

/**
 * Callbacks for JSON line parsing behavior
 */
export interface JsonLineCallbacks {
  onMessage: (message: ParsedClaudeMessage) => void
}

/**
 * Resolve the Claude CLI path, preferring global install over node_modules
 */
export function resolveClaudePath(): string {
  if (process.env.CLAUDE_PATH) {
    logger.info('Resolved claude path from CLAUDE_PATH env', { path: process.env.CLAUDE_PATH })
    return process.env.CLAUDE_PATH
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const possiblePaths = [
    `${homeDir}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${homeDir}/.npm-global/bin/claude`,
  ]

  try {
    const npmPrefix = execSync('npm config get prefix --no-workspaces', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim()
    if (npmPrefix) {
      possiblePaths.push(`${npmPrefix}/bin/claude`)
    }
  } catch {
    // npm not available or timed out — skip
  }

  const loginShellPath = resolveViaLoginShell('claude')
  if (loginShellPath) {
    possiblePaths.push(loginShellPath)
  }

  for (const path of possiblePaths) {
    try {
      accessSync(path, constants.X_OK)
      logger.info('Resolved claude path', { path })
      return path
    } catch {
      // continue to next path
    }
  }

  logger.warn('Could not find claude binary, falling back to PATH lookup', { triedPaths: possiblePaths })
  return 'claude' // Fallback to PATH lookup
}

/**
 * Create a ProcessBehavior that parses newline-delimited JSON from stdout
 * and converts it to ParsedClaudeMessage objects.
 */
export function createJsonLineBehavior(
  callbacks: JsonLineCallbacks
): ProcessBehavior {
  let buffer = ''

  return {
    onStdout: (data: string, process: Process) => {
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line) as ClaudeEvent
          const message: ParsedClaudeMessage = { data: parsed }

          // Include PID for permission requests (needed for responses)
          if (parsed.type === 'control_request') {
            message.pid = process.pid ?? undefined
          }

          callbacks.onMessage(message)
        } catch {
          // Non-JSON output (e.g., verbose logs)
          callbacks.onMessage({
            data: { type: 'raw', content: line },
          })
        }
      }

      // Return undefined to prevent passing to regular stdout callback
      return undefined
    },

    onStderr: (data: string) => {
      callbacks.onMessage({
        data: { type: 'stderr', content: data },
      })
      // Return undefined to prevent passing to regular stderr callback
      return undefined
    },

    onExit: (code: number | null, _signal: string | null, _process: Process) => {
      // Flush any remaining buffer content
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as ClaudeEvent
          callbacks.onMessage({ data: parsed })
        } catch {
          callbacks.onMessage({
            data: { type: 'raw', content: buffer },
          })
        }
        buffer = ''
      }

      // Emit process exit event
      callbacks.onMessage({
        data: { type: 'process_exit', code },
      })
    },
  }
}
