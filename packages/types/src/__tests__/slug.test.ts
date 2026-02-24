/**
 * @fileoverview Tests for slug utilities (toSlug, SLUG_REGEX, UUID_REGEX)
 *
 * Run: bun run --filter @kombuse/types test
 */

import { describe, it, expect } from 'vitest'
import { toSlug, SLUG_REGEX, UUID_REGEX } from '../slug.types'

describe('toSlug', () => {
  it('should convert a multi-word name to kebab-case', () => {
    expect(toSlug('Ticket Analyzer')).toBe('ticket-analyzer')
  })

  it('should convert a single word to lowercase', () => {
    expect(toSlug('Orchestrator')).toBe('orchestrator')
  })

  it('should handle numbers in names', () => {
    expect(toSlug('Agent 2')).toBe('agent-2')
  })

  it('should replace special characters with hyphens', () => {
    expect(toSlug('My Agent (v2.0)')).toBe('my-agent-v2-0')
  })

  it('should strip leading and trailing hyphens', () => {
    expect(toSlug('---hello---')).toBe('hello')
  })

  it('should handle non-ASCII characters', () => {
    expect(toSlug('Über Agent')).toBe('ber-agent')
  })

  it('should pass through an already-valid slug unchanged', () => {
    expect(toSlug('ticket-analyzer')).toBe('ticket-analyzer')
  })

  it('should return empty string for empty input', () => {
    expect(toSlug('')).toBe('')
  })

  it('should return empty string for whitespace-only input', () => {
    expect(toSlug('   ')).toBe('')
  })

  it('should collapse consecutive separators into a single hyphen', () => {
    expect(toSlug('a    b')).toBe('a-b')
  })

  it('should handle mixed special characters and spaces', () => {
    expect(toSlug('Code Reviewer!!')).toBe('code-reviewer')
  })

  it('should handle numbers-only input', () => {
    expect(toSlug('123')).toBe('123')
  })
})

describe('SLUG_REGEX', () => {
  it('should match valid slugs', () => {
    expect(SLUG_REGEX.test('ticket-analyzer')).toBe(true)
    expect(SLUG_REGEX.test('orchestrator')).toBe(true)
    expect(SLUG_REGEX.test('agent-2')).toBe(true)
    expect(SLUG_REGEX.test('a')).toBe(true)
    expect(SLUG_REGEX.test('a1b2')).toBe(true)
  })

  it('should reject invalid slugs', () => {
    expect(SLUG_REGEX.test('')).toBe(false)
    expect(SLUG_REGEX.test('Ticket')).toBe(false)
    expect(SLUG_REGEX.test('-leading')).toBe(false)
    expect(SLUG_REGEX.test('trailing-')).toBe(false)
    expect(SLUG_REGEX.test('double--hyphen')).toBe(false)
    expect(SLUG_REGEX.test('has space')).toBe(false)
    expect(SLUG_REGEX.test('special!')).toBe(false)
  })
})

describe('UUID_REGEX', () => {
  it('should match valid UUIDs (lowercase)', () => {
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('should match valid UUIDs (uppercase)', () => {
    expect(UUID_REGEX.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('should match valid UUIDs (mixed case)', () => {
    expect(UUID_REGEX.test('550e8400-E29B-41d4-A716-446655440000')).toBe(true)
  })

  it('should reject invalid UUID formats', () => {
    expect(UUID_REGEX.test('')).toBe(false)
    expect(UUID_REGEX.test('not-a-uuid')).toBe(false)
    expect(UUID_REGEX.test('550e8400e29b41d4a716446655440000')).toBe(false)
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716')).toBe(false)
    expect(UUID_REGEX.test('pipeline-orchestrator')).toBe(false)
    expect(UUID_REGEX.test('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false)
  })
})
