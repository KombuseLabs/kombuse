import { execSync } from 'node:child_process'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('EnvUtils')

/**
 * Common directories to prepend to PATH for subprocess spawning.
 * Covers Homebrew (ARM + Intel), MacPorts, Nix, and standard locations.
 * `~` placeholders are expanded to $HOME at runtime by buildCleanPath().
 */
const PREPEND_DIRS = [
  '~/.local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/opt/local/bin',         // MacPorts
  '~/.nix-profile/bin',     // Nix (user profile)
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
 * Build a clean, deduplicated PATH string by prepending common install
 * locations, filtering out node_modules/.bin entries, and deduplicating.
 *
 * Logs a warning on macOS when the input PATH looks like the minimal
 * launchd default, which suggests fixMacOsPath() may have failed.
 */
export function buildCleanPath(currentPath?: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''

  const prependDirs = PREPEND_DIRS.map((d) => d.replace('~', homeDir))

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
 * Resolve a binary path by spawning the user's login shell.
 * Works for nvm/fnm/volta-managed installs that aren't on the server PATH.
 */
export function resolveViaLoginShell(binaryName: string): string | null {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = execSync(
      `${shell} -ilc 'command -v ${binaryName}'`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return result || null
  } catch {
    return null
  }
}
