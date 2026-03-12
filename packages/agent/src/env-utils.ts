import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('EnvUtils')

/** Login shell timeout — keep in sync with apps/desktop/src/shell/fix-path.ts */
const LOGIN_SHELL_TIMEOUT_MS = 10_000

/**
 * Common directories to prepend to PATH for subprocess spawning.
 * Covers Homebrew (ARM + Intel), MacPorts, Nix, and standard locations.
 * `~` placeholders are expanded to $HOME at runtime by buildCleanPath().
 */
const PREPEND_DIRS = [
  '~/.local/bin',
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
 * Returns the absolute bin path if the alias file and versioned directory exist,
 * otherwise null. Uses synchronous file reads — no shell spawning.
 */
export function resolveNvmBinDir(): string | null {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    const aliasFile = `${homeDir}/.nvm/alias/default`
    let version = readFileSync(aliasFile, 'utf-8').trim()
    if (!version) return null
    if (!version.startsWith('v')) version = `v${version}`
    const binDir = `${homeDir}/.nvm/versions/node/${version}/bin`
    return existsSync(binDir) ? binDir : null
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
 */
export function resolveViaLoginShell(binaryName: string): string | null {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = execSync(
      `${shell} -ilc 'command -v ${binaryName}'`,
      { encoding: 'utf-8', timeout: LOGIN_SHELL_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return result || null
  } catch {
    return null
  }
}
