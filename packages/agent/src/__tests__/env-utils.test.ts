import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@kombuse/core/logger', () => ({
  createAppLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockExecFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    existsSync: vi.fn(actual.existsSync),
    readdirSync: vi.fn(actual.readdirSync),
  }
})

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { buildCleanPath, createCleanEnv, resolveNvmBinDir, resolveViaLoginShell } from '../env-utils'

describe('buildCleanPath', () => {
  const originalPlatform = process.platform
  const originalHome = process.env.HOME
  const originalNvmDir = process.env.NVM_DIR

  beforeEach(() => {
    process.env.HOME = '/Users/testuser'
    delete process.env.NVM_DIR
    // Prevent resolveNvmBinDir from finding real nvm on the test machine
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT') })
    vi.mocked(readdirSync).mockImplementation(() => { throw new Error('ENOENT') })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env.HOME = originalHome
    if (originalNvmDir) process.env.NVM_DIR = originalNvmDir
    else delete process.env.NVM_DIR
    vi.restoreAllMocks()
  })

  it('prepends common dirs in the correct order', () => {
    const result = buildCleanPath('/some/custom/path')
    const parts = result.split(':')

    expect(parts[0]).toBe('/Users/testuser/.local/bin')
    expect(parts[1]).toBe('/Users/testuser/.nvm/versions/node/current/bin')
    expect(parts[2]).toBe('/Users/testuser/.fnm/current/bin')
    expect(parts[3]).toBe('/Users/testuser/.volta/bin')
    expect(parts[4]).toBe('/Users/testuser/.asdf/shims')
    expect(parts[5]).toBe('/Users/testuser/.local/share/mise/shims')
    expect(parts[6]).toBe('/Users/testuser/.local/share/fnm/aliases/default/bin')
    expect(parts[7]).toBe('/Users/testuser/.fnm/aliases/default/bin')
    expect(parts[8]).toBe('/opt/homebrew/bin')
    expect(parts[9]).toBe('/opt/homebrew/sbin')
    expect(parts[10]).toBe('/opt/local/bin')
    expect(parts[11]).toBe('/Users/testuser/.nix-profile/bin')
    expect(parts[12]).toBe('/nix/var/nix/profiles/default/bin')
    expect(parts[13]).toBe('/usr/local/bin')
    expect(parts[14]).toBe('/usr/bin')
    expect(parts[15]).toBe('/bin')
    expect(parts[16]).toBe('/some/custom/path')
  })

  it('filters out node_modules/.bin entries', () => {
    const result = buildCleanPath('/good/path:/project/node_modules/.bin:/another/good')
    const parts = result.split(':')

    expect(parts).not.toContain('/project/node_modules/.bin')
    expect(parts).toContain('/good/path')
    expect(parts).toContain('/another/good')
  })

  it('deduplicates entries preserving prepend order', () => {
    const result = buildCleanPath('/usr/local/bin:/opt/homebrew/bin:/custom/path')
    const parts = result.split(':')

    // /usr/local/bin and /opt/homebrew/bin should appear only once (in prepend position)
    const homebrewCount = parts.filter((p) => p === '/opt/homebrew/bin').length
    const usrLocalCount = parts.filter((p) => p === '/usr/local/bin').length
    expect(homebrewCount).toBe(1)
    expect(usrLocalCount).toBe(1)

    // /opt/homebrew/bin should come before /usr/local/bin (prepend order)
    expect(parts.indexOf('/opt/homebrew/bin')).toBeLessThan(parts.indexOf('/usr/local/bin'))

    // Custom path should still be present
    expect(parts).toContain('/custom/path')
  })

  it('handles empty PATH', () => {
    const result = buildCleanPath('')
    const parts = result.split(':')

    expect(parts).toContain('/opt/homebrew/bin')
    expect(parts).toContain('/usr/local/bin')
    expect(parts).toContain('/bin')
  })

  it('handles undefined PATH', () => {
    const result = buildCleanPath(undefined)
    const parts = result.split(':')

    expect(parts.length).toBeGreaterThan(0)
    expect(parts).toContain('/opt/homebrew/bin')
  })

  it('expands ~ to HOME directory', () => {
    const result = buildCleanPath('/some/path')
    const parts = result.split(':')

    expect(parts).toContain('/Users/testuser/.local/bin')
    expect(parts).toContain('/Users/testuser/.nix-profile/bin')
    expect(parts).not.toContain('~/.local/bin')
  })

  it('includes MacPorts path /opt/local/bin', () => {
    const result = buildCleanPath('/usr/bin:/bin')
    expect(result.split(':')).toContain('/opt/local/bin')
  })

  it('includes Nix paths', () => {
    const result = buildCleanPath('/usr/bin')
    const parts = result.split(':')
    expect(parts).toContain('/Users/testuser/.nix-profile/bin')
    expect(parts).toContain('/nix/var/nix/profiles/default/bin')
  })

  it('includes node version manager shim directories', () => {
    const result = buildCleanPath('/usr/bin')
    const parts = result.split(':')
    expect(parts).toContain('/Users/testuser/.nvm/versions/node/current/bin')
    expect(parts).toContain('/Users/testuser/.fnm/current/bin')
    expect(parts).toContain('/Users/testuser/.volta/bin')
    expect(parts).toContain('/Users/testuser/.asdf/shims')
    expect(parts).toContain('/Users/testuser/.local/share/mise/shims')
    expect(parts).toContain('/Users/testuser/.local/share/fnm/aliases/default/bin')
    expect(parts).toContain('/Users/testuser/.fnm/aliases/default/bin')
  })
})

describe('createCleanEnv', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset to a controlled env for each test
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    process.env.HOME = '/Users/testuser'
    process.env.PATH = '/usr/bin:/bin'
    process.env.SHELL = '/bin/zsh'
    process.env.FOO = 'bar'
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it('copies all env vars by default', () => {
    const env = createCleanEnv()
    expect(env.FOO).toBe('bar')
    expect(env.SHELL).toBe('/bin/zsh')
  })

  it('applies buildCleanPath to PATH', () => {
    const env = createCleanEnv()
    expect(env.PATH).toContain('/opt/homebrew/bin')
    expect(env.PATH).toContain('/usr/bin')
  })

  it('strips specified keys', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secret'
    process.env.OTHER_SECRET = 'also-secret'

    const env = createCleanEnv({ stripKeys: ['ANTHROPIC_API_KEY', 'OTHER_SECRET'] })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.OTHER_SECRET).toBeUndefined()
    expect(env.FOO).toBe('bar')
  })

  it('sets extra env vars', () => {
    const env = createCleanEnv({ extraEnv: { MAX_THINKING_TOKENS: '32000' } })
    expect(env.MAX_THINKING_TOKENS).toBe('32000')
    expect(env.FOO).toBe('bar')
  })

  it('extraEnv overrides existing vars', () => {
    const env = createCleanEnv({ extraEnv: { FOO: 'overridden' } })
    expect(env.FOO).toBe('overridden')
  })

  it('combines stripKeys and extraEnv', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secret'

    const env = createCleanEnv({
      stripKeys: ['ANTHROPIC_API_KEY'],
      extraEnv: { MAX_THINKING_TOKENS: '32000' },
    })

    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.MAX_THINKING_TOKENS).toBe('32000')
    expect(env.FOO).toBe('bar')
  })

  it('works with no options (preserves all vars)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secret'
    const env = createCleanEnv()
    expect(env.ANTHROPIC_API_KEY).toBe('sk-secret')
    expect(env.FOO).toBe('bar')
  })
})

describe('resolveNvmBinDir', () => {
  const originalHome = process.env.HOME
  const originalNvmDir = process.env.NVM_DIR
  const mockedReadFileSync = vi.mocked(readFileSync)
  const mockedExistsSync = vi.mocked(existsSync)
  const mockedReaddirSync = vi.mocked(readdirSync)

  beforeEach(() => {
    process.env.HOME = '/Users/testuser'
    delete process.env.NVM_DIR
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.HOME = originalHome
    if (originalNvmDir) process.env.NVM_DIR = originalNvmDir
    else delete process.env.NVM_DIR
  })

  it('resolves exact version from alias file', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return 'v22.1.0\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(true)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v22.1.0/bin')
  })

  it('prepends v prefix when missing', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return '22.1.0\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(true)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v22.1.0/bin')
  })

  it('resolves partial version via prefix match', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return '20\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(false) // exact v20/bin doesn't exist
    mockedReaddirSync.mockReturnValue(['v18.19.0', 'v20.10.0', 'v20.11.1'] as any)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v20.11.1/bin')
  })

  it('resolves alias chain (lts/iron → 20)', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return 'lts/iron\n'
      if (path === '/Users/testuser/.nvm/alias/lts/iron') return '20\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(false) // exact v20/bin doesn't exist
    mockedReaddirSync.mockReturnValue(['v18.19.0', 'v20.10.0'] as any)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v20.10.0/bin')
  })

  it('falls back to latest installed version when alias is unresolvable', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return 'node\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(false)
    mockedReaddirSync.mockReturnValue(['v18.19.0', 'v22.1.0'] as any)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v22.1.0/bin')
  })

  it('returns null when alias file does not exist and no versions installed', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    mockedReaddirSync.mockImplementation(() => { throw new Error('ENOENT') })

    expect(resolveNvmBinDir()).toBeNull()
  })

  it('returns null when alias file is empty and no versions installed', () => {
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/Users/testuser/.nvm/alias/default') return '  \n'
      throw new Error('ENOENT')
    })
    mockedReaddirSync.mockImplementation(() => { throw new Error('ENOENT') })

    expect(resolveNvmBinDir()).toBeNull()
  })

  it('respects NVM_DIR env var', () => {
    process.env.NVM_DIR = '/custom/nvm'
    mockedReadFileSync.mockImplementation((path: any) => {
      if (path === '/custom/nvm/alias/default') return 'v22.1.0\n'
      throw new Error('ENOENT')
    })
    mockedExistsSync.mockReturnValue(true)

    expect(resolveNvmBinDir()).toBe('/custom/nvm/versions/node/v22.1.0/bin')
  })
})

describe('resolveViaLoginShell', () => {
  const originalShell = process.env.SHELL

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.SHELL = '/bin/zsh'
  })

  afterEach(() => {
    process.env.SHELL = originalShell
  })

  it('returns result from stage 1 (non-interactive) when found', () => {
    mockExecFileSync.mockReturnValueOnce('/usr/local/bin/claude\n')

    expect(resolveViaLoginShell('claude')).toBe('/usr/local/bin/claude')
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', 'command -v claude'],
      expect.objectContaining({ encoding: 'utf-8' }),
    )
  })

  it('falls back to stage 2 (interactive) when stage 1 returns empty', () => {
    mockExecFileSync.mockReturnValueOnce('') // stage 1: empty
    mockExecFileSync.mockReturnValueOnce('/Users/me/.nvm/versions/node/v20/bin/node\n') // stage 2

    expect(resolveViaLoginShell('node')).toBe('/Users/me/.nvm/versions/node/v20/bin/node')
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      2,
      '/bin/zsh',
      ['-ilc', 'command -v node'],
      expect.objectContaining({ encoding: 'utf-8' }),
    )
  })

  it('falls back to stage 2 (interactive) when stage 1 throws', () => {
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout') })
    mockExecFileSync.mockReturnValueOnce('/Users/me/.bun/bin/bun\n')

    expect(resolveViaLoginShell('bun')).toBe('/Users/me/.bun/bin/bun')
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })

  it('returns null when all shells fail', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })

    expect(resolveViaLoginShell('nonexistent')).toBeNull()
    // 2 stages for user shell + 2 stages for fallback = 4
    expect(mockExecFileSync).toHaveBeenCalledTimes(4)
  })

  it('returns null when all shells return empty', () => {
    mockExecFileSync.mockReturnValue('')

    expect(resolveViaLoginShell('nonexistent')).toBeNull()
    // 2 stages for user shell + 2 stages for fallback = 4
    expect(mockExecFileSync).toHaveBeenCalledTimes(4)
  })

  it('defaults to /bin/zsh when SHELL is unset', () => {
    delete process.env.SHELL

    mockExecFileSync.mockReturnValueOnce('/usr/local/bin/claude\n')

    resolveViaLoginShell('claude')
    expect(mockExecFileSync).toHaveBeenCalledWith(
      '/bin/zsh',
      expect.any(Array),
      expect.any(Object),
    )
  })

  it('strips ANSI escape sequences from result', () => {
    mockExecFileSync.mockReturnValueOnce('\x1B[32m/usr/local/bin/claude\x1B[0m\n')

    expect(resolveViaLoginShell('claude')).toBe('/usr/local/bin/claude')
  })

  it('passes OMZ-safe env vars to execFileSync', () => {
    mockExecFileSync.mockReturnValueOnce('/usr/local/bin/claude\n')

    resolveViaLoginShell('claude')

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
    mockExecFileSync.mockReturnValueOnce('/usr/local/bin/claude\n')

    expect(resolveViaLoginShell('claude')).toBe('/usr/local/bin/claude')
    expect(mockExecFileSync).toHaveBeenCalledTimes(3)
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      3,
      '/bin/zsh',
      expect.any(Array),
      expect.any(Object),
    )
  })

  it('skips fallback shell that matches user shell', () => {
    process.env.SHELL = '/bin/zsh'
    mockExecFileSync.mockImplementation(() => { throw new Error('timeout') })

    resolveViaLoginShell('nonexistent')

    const shells = mockExecFileSync.mock.calls.map((c: any[]) => c[0])
    expect(shells).toEqual(['/bin/zsh', '/bin/zsh', '/bin/bash', '/bin/bash'])
  })
})
