import { describe, expect, it } from 'vitest'
import { resolveCodexPath } from '../utils'

describe('resolveCodexPath', () => {
  it('returns configured path immediately when provided', () => {
    expect(resolveCodexPath('/usr/local/bin/codex')).toBe('/usr/local/bin/codex')
  })

  it('falls through to default resolution when configuredPath is undefined', () => {
    const result = resolveCodexPath(undefined)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('falls through to default resolution when configuredPath is empty string', () => {
    const result = resolveCodexPath('')
    expect(typeof result).toBe('string')
    // Empty string is falsy, so it should NOT return ''
    expect(result).not.toBe('')
  })

  it('returns the exact configured path without modification', () => {
    const customPath = '/home/user/.cargo/bin/codex'
    expect(resolveCodexPath(customPath)).toBe(customPath)
  })
})
