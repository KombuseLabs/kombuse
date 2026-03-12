import { execSync } from 'node:child_process'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('FixPath')

const DELIM = '__KOMBUSE_PATH__'

/**
 * On macOS, GUI-launched apps (Finder, Dock, Spotlight) inherit launchd's
 * minimal PATH which doesn't include nvm/fnm/volta directories. This spawns
 * the user's login shell to extract their real PATH.
 */
export function fixMacOsPath(): boolean {
  if (process.platform !== 'darwin') return true

  const userShell = process.env.SHELL || '/bin/zsh'
  const originalPath = process.env.PATH
  const timeoutMs = 10000
  try {
    const output = execSync(
      `${userShell} -ilc 'echo ${DELIM}$PATH${DELIM}'`,
      { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const match = output.match(new RegExp(`${DELIM}(.+?)${DELIM}`))
    if (match?.[1]) {
      process.env.PATH = match[1]
      logger.info('Shell PATH extraction succeeded', { shell: userShell })
      return true
    }
    logger.warn('Shell PATH extraction returned no match — using fallback PATH', {
      shell: userShell,
      timeoutMs,
      originalPath,
    })
    return false
  } catch (err) {
    logger.warn('Failed to extract PATH from shell', {
      shell: userShell,
      timeoutMs,
      originalPath,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
