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

})
