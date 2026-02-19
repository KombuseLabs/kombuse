import { describe, expect, it } from 'vitest'
import { updateProjectTrustEntry } from '../codex-config'

describe('updateProjectTrustEntry', () => {
  it('adds a trust entry to empty content', () => {
    const result = updateProjectTrustEntry('', '/Users/test/myproject')
    expect(result).toContain('trust_level = "trusted"')
  })

  it('defaults trust level to trusted', () => {
    const result = updateProjectTrustEntry('', '/some/path')
    expect(result).toContain('trust_level = "trusted"')
  })

  it('accepts a custom trust level', () => {
    const result = updateProjectTrustEntry('', '/some/path', 'untrusted')
    expect(result).toContain('trust_level = "untrusted"')
  })

  it('preserves existing mcp_servers section', () => {
    const existing = [
      '[mcp_servers.kombuse]',
      'command = "bun"',
      'enabled = true',
      '',
    ].join('\n')
    const result = updateProjectTrustEntry(existing, '/my/project')
    expect(result).toContain('command = "bun"')
    expect(result).toContain('trust_level = "trusted"')
  })

  it('preserves existing project entries when adding a new one', () => {
    const existing = [
      '[projects."/first/project"]',
      'trust_level = "trusted"',
      '',
    ].join('\n')
    const result = updateProjectTrustEntry(existing, '/second/project')
    // Both entries should be present
    expect(result).toMatch(/first\/project/)
    expect(result).toMatch(/second\/project/)
  })

  it('updates trust level for an existing path', () => {
    const existing = [
      '[projects."/my/project"]',
      'trust_level = "untrusted"',
      '',
    ].join('\n')
    const result = updateProjectTrustEntry(existing, '/my/project', 'trusted')
    expect(result).toContain('trust_level = "trusted"')
    expect(result).not.toContain('untrusted')
  })

  it('preserves extra fields in an existing project entry', () => {
    const existing = [
      '[projects."/my/project"]',
      'trust_level = "trusted"',
      'sandbox = "relaxed"',
      '',
    ].join('\n')
    const result = updateProjectTrustEntry(existing, '/my/project')
    expect(result).toContain('sandbox = "relaxed"')
    expect(result).toContain('trust_level = "trusted"')
  })

  it('handles malformed TOML content gracefully', () => {
    const result = updateProjectTrustEntry('not valid toml {{{{', '/my/project')
    expect(result).toContain('trust_level = "trusted"')
  })
})
