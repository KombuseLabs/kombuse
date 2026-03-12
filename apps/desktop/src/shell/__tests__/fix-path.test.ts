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

  it('returns false when both stages fail', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })

    expect(fixMacOsPath()).toBe(false)
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })

  it('returns false when both stages return launchd-only PATH', () => {
    mockExecFileSync.mockReturnValue(`${DELIM}${LAUNCHD_PATH}${DELIM}\n`)

    expect(fixMacOsPath()).toBe(false)
    // Still applies stage 1 result as it's at least as good as current PATH
    expect(process.env.PATH).toBe(LAUNCHD_PATH)
  })

  it('returns false when stage 1 returns no match and stage 2 fails', () => {
    // Stage 1: output with no delimiter match
    mockExecFileSync.mockReturnValueOnce('some random shell output\n')
    // Stage 2: throws
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout') })

    expect(fixMacOsPath()).toBe(false)
  })
})
