import { describe, it, expect } from 'vitest'
import { backendLabel } from '../backend-utils'

describe('backendLabel', () => {
  it('returns "Claude Code" for claude-code type', () => {
    expect(backendLabel('claude-code')).toBe('Claude Code')
  })

  it('returns "Codex" for codex type', () => {
    expect(backendLabel('codex')).toBe('Codex')
  })

  it('returns the raw type string for unknown backends', () => {
    expect(backendLabel('some-future-backend')).toBe('some-future-backend')
  })
})
