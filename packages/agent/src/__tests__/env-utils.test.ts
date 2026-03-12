import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@kombuse/core/logger', () => ({
  createAppLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { buildCleanPath } from '../env-utils'

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
    expect(parts[4]).toBe('/opt/homebrew/bin')
    expect(parts[5]).toBe('/opt/homebrew/sbin')
    expect(parts[6]).toBe('/opt/local/bin')
    expect(parts[7]).toBe('/Users/testuser/.nix-profile/bin')
    expect(parts[8]).toBe('/nix/var/nix/profiles/default/bin')
    expect(parts[9]).toBe('/usr/local/bin')
    expect(parts[10]).toBe('/usr/bin')
    expect(parts[11]).toBe('/bin')
    expect(parts[12]).toBe('/some/custom/path')
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
  })
})
