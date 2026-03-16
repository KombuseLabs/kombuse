import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before fixMacOsPath import
// ---------------------------------------------------------------------------

const mockExecFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}))

vi.mock('@kombuse/core/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { fixMacOsPath } from '../fix-path'

const DELIM = '__KOMBUSE_PATH__'
const RICH_PATH = '/opt/homebrew/bin:/Users/me/.nvm/versions/node/v20/bin:/usr/local/bin:/usr/bin:/bin'
const LAUNCHD_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

describe('fixMacOsPath', () => {
  const originalPlatform = process.platform
  const originalShell = process.env.SHELL
  const originalPath = process.env.PATH

  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    process.env.SHELL = '/bin/zsh'
    process.env.PATH = LAUNCHD_PATH
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    process.env.SHELL = originalShell
    process.env.PATH = originalPath
  })

  it('returns true immediately on non-darwin platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    expect(fixMacOsPath()).toBe(true)
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('succeeds with non-interactive login shell (stage 1)', () => {
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(true)
    expect(process.env.PATH).toBe(RICH_PATH)

    // Should only call once (stage 1 succeeded, no stage 2)
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', expect.stringContaining(DELIM)],
      expect.any(Object),
    )
  })

  it('falls back to interactive shell when stage 1 returns launchd-only PATH', () => {
    // Stage 1: returns launchd-only PATH
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${LAUNCHD_PATH}${DELIM}\n`)
    // Stage 2: returns rich PATH
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(true)
    expect(process.env.PATH).toBe(RICH_PATH)
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)

    // Verify stage 2 used -ilc
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      2,
      '/bin/zsh',
      ['-ilc', expect.stringContaining(DELIM)],
      expect.any(Object),
    )
  })

  it('falls back to interactive shell when stage 1 fails', () => {
    // Stage 1: throws
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout') })
    // Stage 2: returns rich PATH
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(true)
    expect(process.env.PATH).toBe(RICH_PATH)
  })

  it('returns false when all shells fail', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })

    expect(fixMacOsPath()).toBe(false)
    // 2 stages for user shell (/bin/zsh) + 2 stages for fallback (/bin/bash)
    expect(mockExecFileSync).toHaveBeenCalledTimes(4)
  })

  it('returns false when all shells return launchd-only PATH', () => {
    mockExecFileSync.mockReturnValue(`${DELIM}${LAUNCHD_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(false)
    // Still applies stage 1 result as it's at least as good as current PATH
    expect(process.env.PATH).toBe(LAUNCHD_PATH)
  })

  it('returns false when stage 1 returns no match and all other attempts fail', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })
    // Stage 1 of user shell: output with no delimiter match
    mockExecFileSync.mockReturnValueOnce('some random shell output\n')

    expect(fixMacOsPath()).toBe(false)
  })

  it('strips ANSI escape sequences from extracted PATH', () => {
    const ansiPath = `\x1B[32m${RICH_PATH}\x1B[0m`
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${ansiPath}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(true)
    expect(process.env.PATH).toBe(RICH_PATH)
  })

  it('passes OMZ-safe env vars to execFileSync', () => {
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    fixMacOsPath()

    const callEnv = mockExecFileSync.mock.calls[0]![2].env
    expect(callEnv.DISABLE_AUTO_UPDATE).toBe('true')
    expect(callEnv.ZSH_TMUX_AUTOSTARTED).toBe('true')
    expect(callEnv.ZSH_TMUX_AUTOSTART).toBe('false')
  })

  it('tries fallback shell when user shell fails', () => {
    process.env.SHELL = '/usr/local/bin/fish'

    // Fish fails both stages
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout') })
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout') })
    // /bin/zsh stage 1 succeeds
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(true)
    expect(process.env.PATH).toBe(RICH_PATH)
    expect(mockExecFileSync).toHaveBeenCalledTimes(3)
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      3,
      '/bin/zsh',
      expect.any(Array),
      expect.any(Object),
    )
  })

  it('passes brace-isolated ${PATH} in the echo command', () => {
    mockExecFileSync.mockReturnValueOnce(`${DELIM}${RICH_PATH}${DELIM}\n`)

    fixMacOsPath()

    const echoArg = mockExecFileSync.mock.calls[0]![1][1] as string
    expect(echoArg).toBe(`echo ${DELIM}\${PATH}${DELIM}`)
  })

  it('skips fallback shell that matches user shell', () => {
    process.env.SHELL = '/bin/zsh'
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })

    fixMacOsPath()

    // Should try /bin/zsh (user shell) x2 + /bin/bash (fallback) x2 = 4
    // /bin/zsh should NOT be retried as a fallback
    const shells = mockExecFileSync.mock.calls.map((c: any[]) => c[0])
    expect(shells).toEqual(['/bin/zsh', '/bin/zsh', '/bin/bash', '/bin/bash'])
  })
})
