import { describe, it, expect } from 'vitest'
import { backendLabel, normalizeBackendType, normalizeBackendChoice } from '../backend-utils'

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

describe('normalizeBackendType', () => {
  it('returns claude-code for valid value', () => {
    expect(normalizeBackendType('claude-code')).toBe('claude-code')
  })

  it('returns codex for valid value', () => {
    expect(normalizeBackendType('codex')).toBe('codex')
  })

  it('returns mock for valid value', () => {
    expect(normalizeBackendType('mock')).toBe('mock')
  })

  it('defaults to claude-code for null', () => {
    expect(normalizeBackendType(null)).toBe('claude-code')
  })

  it('defaults to claude-code for undefined', () => {
    expect(normalizeBackendType(undefined)).toBe('claude-code')
  })

  it('defaults to claude-code for unknown string', () => {
    expect(normalizeBackendType('unknown')).toBe('claude-code')
  })
})

describe('normalizeBackendChoice', () => {
  it('returns claude-code for valid backend', () => {
    expect(normalizeBackendChoice('claude-code')).toBe('claude-code')
  })

  it('returns codex for valid backend', () => {
    expect(normalizeBackendChoice('codex')).toBe('codex')
  })

  it('returns mock for valid backend', () => {
    expect(normalizeBackendChoice('mock')).toBe('mock')
  })

  it('returns global for unknown value', () => {
    expect(normalizeBackendChoice('unknown')).toBe('global')
  })

  it('returns global for null', () => {
    expect(normalizeBackendChoice(null)).toBe('global')
  })

  it('returns global for undefined', () => {
    expect(normalizeBackendChoice(undefined)).toBe('global')
  })
})
