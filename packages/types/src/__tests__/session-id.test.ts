/**
 * @fileoverview Tests for session ID utilities
 *
 * Run: bun run --filter @kombuse/types test
 */

import { describe, it, expect } from 'vitest'
import {
  createSessionId,
  parseSessionId,
  isValidSessionId,
  isLegacyInvocationId,
  isAcceptableSessionId,
  getSessionOrigin,
  assertSessionId,
} from '../session-id'

describe('session-id utilities', () => {
  describe('createSessionId', () => {
    it('should create chat session ID with correct prefix', () => {
      const id = createSessionId('chat')
      expect(id).toMatch(/^chat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('should create trigger session ID with correct prefix', () => {
      const id = createSessionId('trigger')
      expect(id).toMatch(/^trigger-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('should generate unique IDs', () => {
      const ids = new Set([...Array(100)].map(() => createSessionId('chat')))
      expect(ids.size).toBe(100)
    })
  })

  describe('parseSessionId', () => {
    it('should parse valid chat session ID', () => {
      const parsed = parseSessionId('chat-550e8400-e29b-41d4-a716-446655440000')
      expect(parsed).toEqual({
        origin: 'chat',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        raw: 'chat-550e8400-e29b-41d4-a716-446655440000',
      })
    })

    it('should parse valid trigger session ID', () => {
      const parsed = parseSessionId('trigger-550e8400-e29b-41d4-a716-446655440000')
      expect(parsed).toEqual({
        origin: 'trigger',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        raw: 'trigger-550e8400-e29b-41d4-a716-446655440000',
      })
    })

    it('should return null for legacy invocation format', () => {
      expect(parseSessionId('invocation-123')).toBeNull()
    })

    it('should return null for invalid format', () => {
      expect(parseSessionId('random-string')).toBeNull()
      expect(parseSessionId('')).toBeNull()
      expect(parseSessionId('chat-invalid-uuid')).toBeNull()
    })
  })

  describe('isValidSessionId', () => {
    it('should return true for valid session IDs', () => {
      expect(isValidSessionId('chat-550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isValidSessionId('trigger-550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    })

    it('should return false for invalid formats', () => {
      expect(isValidSessionId('invocation-123')).toBe(false)
      expect(isValidSessionId('random-string')).toBe(false)
      expect(isValidSessionId('')).toBe(false)
    })
  })

  describe('isLegacyInvocationId', () => {
    it('should recognize legacy invocation IDs', () => {
      expect(isLegacyInvocationId('invocation-123')).toBe(true)
      expect(isLegacyInvocationId('invocation-0')).toBe(true)
      expect(isLegacyInvocationId('invocation-999999')).toBe(true)
    })

    it('should reject non-legacy formats', () => {
      expect(isLegacyInvocationId('chat-550e8400-e29b-41d4-a716-446655440000')).toBe(false)
      expect(isLegacyInvocationId('trigger-550e8400-e29b-41d4-a716-446655440000')).toBe(false)
      expect(isLegacyInvocationId('invocation-abc')).toBe(false)
      expect(isLegacyInvocationId('invocation-')).toBe(false)
    })
  })

  describe('isAcceptableSessionId', () => {
    it('should accept new format session IDs', () => {
      expect(isAcceptableSessionId('chat-550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isAcceptableSessionId('trigger-550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    })

    it('should accept legacy invocation IDs', () => {
      expect(isAcceptableSessionId('invocation-123')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isAcceptableSessionId('random-string')).toBe(false)
      expect(isAcceptableSessionId('')).toBe(false)
    })
  })

  describe('getSessionOrigin', () => {
    it('should return origin for valid session IDs', () => {
      expect(getSessionOrigin('chat-550e8400-e29b-41d4-a716-446655440000')).toBe('chat')
      expect(getSessionOrigin('trigger-550e8400-e29b-41d4-a716-446655440000')).toBe('trigger')
    })

    it('should return legacy for invocation format', () => {
      expect(getSessionOrigin('invocation-42')).toBe('legacy')
    })

    it('should return null for unknown formats', () => {
      expect(getSessionOrigin('unknown-format')).toBeNull()
      expect(getSessionOrigin('')).toBeNull()
    })
  })

  describe('assertSessionId', () => {
    it('should not throw for valid session IDs', () => {
      expect(() => assertSessionId('chat-550e8400-e29b-41d4-a716-446655440000')).not.toThrow()
      expect(() => assertSessionId('trigger-550e8400-e29b-41d4-a716-446655440000')).not.toThrow()
    })

    it('should throw for invalid formats', () => {
      expect(() => assertSessionId('invocation-123')).toThrow(/Invalid session ID format/)
      expect(() => assertSessionId('random-string')).toThrow(/Invalid session ID format/)
    })
  })
})
