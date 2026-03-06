import { execSync } from 'node:child_process'

const DELIM = '__KOMBUSE_PATH__'

/**
 * On macOS, GUI-launched apps (Finder, Dock, Spotlight) inherit launchd's
 * minimal PATH which doesn't include nvm/fnm/volta directories. This spawns
 * the user's login shell to extract their real PATH.
 */
export function fixMacOsPath(): void {
  if (process.platform !== 'darwin') return

  const userShell = process.env.SHELL || '/bin/zsh'
  try {
    const output = execSync(
      `${userShell} -ilc 'echo ${DELIM}$PATH${DELIM}'`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const match = output.match(new RegExp(`${DELIM}(.+?)${DELIM}`))
    if (match?.[1]) {
      process.env.PATH = match[1]
    }
  } catch {
    // Keep existing PATH as fallback
  }
}
