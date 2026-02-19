import { execSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import type { Process, ProcessBehavior } from '../../types'
import type { JsonRpcMessage } from './types'

export interface JsonRpcLineCallbacks {
  onMessage: (message: JsonRpcMessage) => void
  onParseError?: (line: string, error: Error) => void
}

/**
 * Resolve Codex CLI path, preferring explicit env/configured install locations.
 */
export function resolveCodexPath(): string {
  if (process.env.CODEX_PATH) {
    return process.env.CODEX_PATH
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const possiblePaths = [
    '/Applications/Codex.app/Contents/Resources/codex',
    `${homeDir}/.local/bin/codex`,
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    `${homeDir}/.npm-global/bin/codex`,
  ]

  try {
    const npmPrefix = execSync('npm config get prefix --no-workspaces', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim()
    if (npmPrefix) {
      possiblePaths.push(`${npmPrefix}/bin/codex`)
    }
  } catch {
    // npm not available or timed out — skip
  }

  for (const path of possiblePaths) {
    try {
      accessSync(path, constants.X_OK)
      return path
    } catch {
      // continue
    }
  }

  return 'codex'
}

/**
 * Build a clean environment while preserving user auth/session state.
 */
export function createCleanEnv(): Record<string, string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const cleanPath = process.env.PATH?.split(':')
    .filter((p) => !p.includes('node_modules/.bin'))
    .join(':')

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  env.PATH = `${homeDir}/.local/bin:/usr/local/bin:/usr/bin:/bin${cleanPath ? ':' + cleanPath : ''}`

  return env
}

/**
 * Parse newline-delimited JSON-RPC messages from stdout.
 */
export function createJsonRpcLineBehavior(callbacks: JsonRpcLineCallbacks): ProcessBehavior {
  let stdoutBuffer = ''

  const parseLine = (line: string) => {
    if (!line.trim()) {
      return
    }

    try {
      const parsed = JSON.parse(line) as JsonRpcMessage
      callbacks.onMessage(parsed)
    } catch (error) {
      callbacks.onParseError?.(
        line,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  return {
    onStdout: (data: string, _process: Process) => {
      stdoutBuffer += data
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        parseLine(line)
      }

      return undefined
    },

    onExit: () => {
      if (stdoutBuffer.trim()) {
        parseLine(stdoutBuffer)
        stdoutBuffer = ''
      }
    },
  }
}
