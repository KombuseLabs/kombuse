import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@kombuse/core/logger', () => ({
  createAppLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    existsSync: vi.fn(actual.existsSync),
  }
})

import { readFileSync, existsSync } from 'node:fs'
import { buildCleanPath, createCleanEnv, resolveNvmBinDir } from '../env-utils'

describe('buildCleanPath', () => {
  const originalPlatform = process.platform
  const originalHome = process.env.HOME

  beforeEach(() => {
    process.env.HOME = '/Users/testuser'
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env.HOME = originalHome
  })

  it('prepends common dirs in the correct order', () => {
    const result = buildCleanPath('/some/custom/path')
    const parts = result.split(':')

    expect(parts[0]).toBe('/Users/testuser/.local/bin')
    expect(parts[1]).toBe('/Users/testuser/.volta/bin')
    expect(parts[2]).toBe('/Users/testuser/.asdf/shims')
    expect(parts[3]).toBe('/Users/testuser/.local/share/mise/shims')
    expect(parts[4]).toBe('/Users/testuser/.local/share/fnm/aliases/default/bin')
    expect(parts[5]).toBe('/Users/testuser/.fnm/aliases/default/bin')
    expect(parts[6]).toBe('/opt/homebrew/bin')
    expect(parts[7]).toBe('/opt/homebrew/sbin')
    expect(parts[8]).toBe('/opt/local/bin')
    expect(parts[9]).toBe('/Users/testuser/.nix-profile/bin')
    expect(parts[10]).toBe('/nix/var/nix/profiles/default/bin')
    expect(parts[11]).toBe('/usr/local/bin')
    expect(parts[12]).toBe('/usr/bin')
    expect(parts[13]).toBe('/bin')
    expect(parts[14]).toBe('/some/custom/path')
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
  const mockedReadFileSync = vi.mocked(readFileSync)
  const mockedExistsSync = vi.mocked(existsSync)

  beforeEach(() => {
    process.env.HOME = '/Users/testuser'
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.HOME = originalHome
  })

  it('resolves versioned bin path from alias file', () => {
    mockedReadFileSync.mockReturnValue('v22.1.0\n')
    mockedExistsSync.mockReturnValue(true)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v22.1.0/bin')
    expect(mockedReadFileSync).toHaveBeenCalledWith('/Users/testuser/.nvm/alias/default', 'utf-8')
    expect(mockedExistsSync).toHaveBeenCalledWith('/Users/testuser/.nvm/versions/node/v22.1.0/bin')
  })

  it('prepends v prefix when missing', () => {
    mockedReadFileSync.mockReturnValue('22\n')
    mockedExistsSync.mockReturnValue(true)

    expect(resolveNvmBinDir()).toBe('/Users/testuser/.nvm/versions/node/v22/bin')
  })

  it('returns null when alias file does not exist', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    expect(resolveNvmBinDir()).toBeNull()
  })

  it('returns null when versioned directory does not exist', () => {
    mockedReadFileSync.mockReturnValue('v22.1.0\n')
    mockedExistsSync.mockReturnValue(false)

    expect(resolveNvmBinDir()).toBeNull()
  })

  it('returns null when alias file is empty', () => {
    mockedReadFileSync.mockReturnValue('  \n')

    expect(resolveNvmBinDir()).toBeNull()
  })
})
