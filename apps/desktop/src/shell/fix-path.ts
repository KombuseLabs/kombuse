import { execFileSync } from 'node:child_process'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('FixPath')

const DELIM = '__KOMBUSE_PATH__'

/** Strip ANSI SGR escape sequences from a string. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

/** Fallback POSIX shells to try when the user's default shell fails. */
const FALLBACK_SHELLS = ['/bin/zsh', '/bin/bash']

/** Login shell timeout — keep in sync with packages/agent/src/env-utils.ts */
const LOGIN_SHELL_TIMEOUT_MS = 10_000

/** Minimal PATH that launchd provides to GUI-launched apps on macOS. */
const LAUNCHD_DIRS = new Set(['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])

/**
 * Returns true if every directory in `pathStr` is a launchd default,
 * meaning the login shell didn't add anything useful.
 */
function isLaunchdOnlyPath(pathStr: string): boolean {
  return pathStr.split(':').filter(Boolean).every((d) => LAUNCHD_DIRS.has(d))
}

/**
 * Try to extract PATH from the user's shell with the given flags.
 * Returns the extracted PATH string, or null on failure.
 */
function extractPath(shell: string, flags: string, timeoutMs: number): string | null {
  try {
    const output = execFileSync(
      shell,
      [flags, `echo ${DELIM}\${PATH}${DELIM}`],
      {
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DISABLE_AUTO_UPDATE: 'true',
          ZSH_TMUX_AUTOSTARTED: 'true',
          ZSH_TMUX_AUTOSTART: 'false',
        },
      },
    )
    const match = output.match(new RegExp(`${DELIM}(.+?)${DELIM}`))
    return match?.[1] ? stripAnsi(match[1]) : null
  } catch {
    return null
  }
}

/**
 * On macOS, GUI-launched apps (Finder, Dock, Spotlight) inherit launchd's
 * minimal PATH which doesn't include nvm/fnm/volta directories. This spawns
 * the user's login shell to extract their real PATH.
 *
 * Uses a two-stage strategy:
 *  1. Non-interactive login shell (`-lc`) — reliable, skips .zshrc plugins.
 *  2. Interactive login shell (`-ilc`) fallback — only if stage 1 returned
 *     the launchd-default PATH, covering users who configure PATH in .zshrc.
 */
export function fixMacOsPath(): boolean {
  if (process.platform !== 'darwin') return true

  const userShell = process.env.SHELL || '/bin/zsh'
  const originalPath = process.env.PATH
  const timeoutMs = LOGIN_SHELL_TIMEOUT_MS

  // Stage 1: non-interactive login shell (fast, reliable)
  const stage1 = extractPath(userShell, '-lc', timeoutMs)
  if (stage1 && !isLaunchdOnlyPath(stage1)) {
    process.env.PATH = stage1
    logger.info('Shell PATH extraction succeeded (non-interactive)', { shell: userShell })
    return true
  }

  // Stage 2: interactive login shell fallback (covers PATH-in-.zshrc setups)
  const stage2 = extractPath(userShell, '-ilc', timeoutMs)
  if (stage2 && !isLaunchdOnlyPath(stage2)) {
    process.env.PATH = stage2
    logger.info('Shell PATH extraction succeeded (interactive fallback)', { shell: userShell })
    return true
  }

  // Try fallback shells (covers Fish/Nushell users with a POSIX shell available)
  for (const fallbackShell of FALLBACK_SHELLS.filter((s) => s !== userShell)) {
    const fb1 = extractPath(fallbackShell, '-lc', timeoutMs)
    if (fb1 && !isLaunchdOnlyPath(fb1)) {
      process.env.PATH = fb1
      logger.info('Shell PATH extraction succeeded (fallback shell, non-interactive)', { shell: fallbackShell })
      return true
    }

    const fb2 = extractPath(fallbackShell, '-ilc', timeoutMs)
    if (fb2 && !isLaunchdOnlyPath(fb2)) {
      process.env.PATH = fb2
      logger.info('Shell PATH extraction succeeded (fallback shell, interactive)', { shell: fallbackShell })
      return true
    }
  }

  // All shells exhausted — apply best result we got, if any.
  if (stage1) {
    process.env.PATH = stage1
  }

  logger.warn('Shell PATH extraction returned only launchd defaults — using fallback PATH', {
    shell: userShell,
    timeoutMs,
    originalPath,
  })
  return false
}
