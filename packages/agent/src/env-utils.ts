import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('EnvUtils')

/** Login shell timeout — keep in sync with apps/desktop/src/shell/fix-path.ts */
const LOGIN_SHELL_TIMEOUT_MS = 10_000

/** Strip ANSI SGR escape sequences from a string. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

/** Fallback POSIX shells to try when the user's default shell fails. */
const FALLBACK_SHELLS = ['/bin/zsh', '/bin/bash']

/**
 * Common directories to prepend to PATH for subprocess spawning.
 * Covers Homebrew (ARM + Intel), MacPorts, Nix, and standard locations.
 * `~` placeholders are expanded to $HOME at runtime by buildCleanPath().
 */
const PREPEND_DIRS = [
  '~/.local/bin',
  '~/.nvm/versions/node/current/bin', // nvm (current symlink)
  '~/.fnm/current/bin',               // fnm (current symlink)
  '~/.volta/bin',            // Volta
  '~/.asdf/shims',           // asdf
  '~/.local/share/mise/shims', // mise (formerly rtx)
  '~/.local/share/fnm/aliases/default/bin', // fnm (XDG)
  '~/.fnm/aliases/default/bin',              // fnm (legacy)
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/opt/local/bin',           // MacPorts
  '~/.nix-profile/bin',       // Nix (user profile)
  '/nix/var/nix/profiles/default/bin', // Nix (system profile)
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
]

/**
 * The minimal PATH that macOS launchd provides to GUI-launched apps.
 * If the current PATH only contains these dirs, fixMacOsPath() likely failed.
 */
const LAUNCHD_DIRS = new Set(['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])

/**
 * Resolve the nvm default Node bin directory by reading ~/.nvm/alias/default.
 * Handles full versions ("v20.10.0"), major-only ("20"), and alias chains
 * ("lts/iron", "lts/*"). Falls back to the latest installed version if the
 * alias cannot be resolved to an exact directory.
 * Returns the absolute bin path or null. Synchronous file reads only.
 */
export function resolveNvmBinDir(): string | null {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    const nvmDir = process.env.NVM_DIR || `${homeDir}/.nvm`
    const versionsDir = `${nvmDir}/versions/node`

    // Read the default alias — may be "v20.10.0", "20", "lts/iron", etc.
    let alias: string | null = null
    try {
      alias = readFileSync(`${nvmDir}/alias/default`, 'utf-8').trim() || null
    } catch { /* no alias file */ }

    // Resolve alias chains: nvm stores lts/* → lts/iron, lts/iron → 20, etc.
    if (alias) {
      for (let i = 0; i < 5; i++) {
        try {
          const resolved = readFileSync(`${nvmDir}/alias/${alias}`, 'utf-8').trim()
          if (resolved) { alias = resolved; continue }
        } catch { /* not an alias, it's a version */ }
        break
      }
    }

    // Try exact match first
    if (alias) {
      const version = alias.startsWith('v') ? alias : `v${alias}`
      const binDir = `${versionsDir}/${version}/bin`
      if (existsSync(binDir)) return binDir
    }

    // Try prefix match for partial versions (e.g. "20" → "v20.10.0")
    if (alias) {
      const prefix = alias.startsWith('v') ? alias : `v${alias}`
      try {
        const versions = readdirSync(versionsDir).filter((v) => v.startsWith('v')).sort()
        const match = versions.filter((v) => v === prefix || v.startsWith(`${prefix}.`))
        if (match.length > 0) {
          return `${versionsDir}/${match[match.length - 1]}/bin`
        }
      } catch { /* versions dir doesn't exist */ }
    }

    // Last resort: latest installed version
    try {
      const versions = readdirSync(versionsDir).filter((v) => v.startsWith('v')).sort()
      if (versions.length > 0) {
        return `${versionsDir}/${versions[versions.length - 1]}/bin`
      }
    } catch { /* no versions installed */ }

    return null
  } catch {
    return null
  }
}

/**
 * Build a clean, deduplicated PATH string by prepending common install
 * locations, filtering out node_modules/.bin entries, and deduplicating.
 *
 * Logs a warning on macOS when the input PATH looks like the minimal
 * launchd default, which suggests fixMacOsPath() may have failed.
 */
export function buildCleanPath(currentPath?: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''

  const prependDirs = PREPEND_DIRS.map((d) => d.replace('~', homeDir))

  const nvmBin = resolveNvmBinDir()
  if (nvmBin) prependDirs.unshift(nvmBin)

  const existingDirs = (currentPath || '').split(':')
    .filter((p) => p && !p.includes('node_modules/.bin'))

  // Warn if the PATH looks like the minimal launchd default on macOS
  if (process.platform === 'darwin' && existingDirs.length > 0) {
    const allLaunchd = existingDirs.every((d) => LAUNCHD_DIRS.has(d))
    if (allLaunchd) {
      logger.warn(
        'PATH appears to be the minimal macOS launchd default — shell PATH extraction may have failed. ' +
        'Using expanded fallback paths.',
        { PATH: currentPath }
      )
    }
  }

  const seen = new Set<string>()
  const pathParts: string[] = []
  for (const dir of [...prependDirs, ...existingDirs]) {
    if (!seen.has(dir)) {
      seen.add(dir)
      pathParts.push(dir)
    }
  }
  return pathParts.join(':')
}

/**
 * Options for creating a clean subprocess environment.
 */
export interface CleanEnvOptions {
  /** Env var keys to strip from process.env (e.g. ['ANTHROPIC_API_KEY']) */
  stripKeys?: string[]
  /** Additional env vars to set (applied after stripping) */
  extraEnv?: Record<string, string>
}

/**
 * Create a clean environment for spawning agent subprocesses.
 * Copies process.env (filtering undefined values), strips specified keys,
 * rebuilds PATH via buildCleanPath(), and merges any extra env vars.
 */
export function createCleanEnv(options?: CleanEnvOptions): Record<string, string> {
  const stripSet = new Set(options?.stripKeys)

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !stripSet.has(key)) {
      env[key] = value
    }
  }

  env.PATH = buildCleanPath(process.env.PATH)

  if (options?.extraEnv) {
    Object.assign(env, options.extraEnv)
  }

  return env
}

/**
 * Resolve a binary path by spawning the user's login shell.
 * Works for nvm/fnm/volta-managed installs that aren't on the server PATH.
 *
 * Uses a two-stage strategy (mirrors fixMacOsPath in fix-path.ts):
 *  1. Non-interactive login shell (`-lc`) — fast, skips .zshrc plugins.
 *  2. Interactive login shell (`-ilc`) fallback — covers users who
 *     configure PATH in .zshrc (e.g. NVM, bun).
 */
export function resolveViaLoginShell(binaryName: string): string | null {
  const userShell = process.env.SHELL || '/bin/zsh'
  const cmd = `command -v ${binaryName}`
  const opts = {
    encoding: 'utf-8' as const,
    timeout: LOGIN_SHELL_TIMEOUT_MS,
    stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DISABLE_AUTO_UPDATE: 'true',
      ZSH_TMUX_AUTOSTARTED: 'true',
      ZSH_TMUX_AUTOSTART: 'false',
    },
  }

  const shells = [userShell, ...FALLBACK_SHELLS.filter((s) => s !== userShell)]

  for (const shell of shells) {
    // Stage 1: non-interactive login shell (fast, skips .zshrc plugins)
    try {
      const result = stripAnsi(execFileSync(shell, ['-lc', cmd], opts).trim())
      if (result) return result
    } catch {
      // fall through to stage 2
    }

    // Stage 2: interactive login shell (covers PATH-in-.zshrc setups like NVM/bun)
    try {
      const result = stripAnsi(execFileSync(shell, ['-ilc', cmd], opts).trim())
      if (result) return result
    } catch {
      // try next shell
    }
  }

  return null
}
