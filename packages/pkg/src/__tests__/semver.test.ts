import { describe, it, expect } from 'vitest'
import {
  isValidVersion,
  isNewerVersion,
  sortVersionsDesc,
  findLatest,
  findMaxSatisfying,
} from '../version/semver'

describe('semver utilities', () => {
  describe('isValidVersion', () => {
    it('should return true for valid semver strings', () => {
      expect(isValidVersion('1.0.0')).toBe(true)
      expect(isValidVersion('0.0.1')).toBe(true)
      expect(isValidVersion('10.20.30')).toBe(true)
      expect(isValidVersion('1.2.3-beta.1')).toBe(true)
    })

    it('should return false for invalid strings', () => {
      expect(isValidVersion('not-a-version')).toBe(false)
      expect(isValidVersion('')).toBe(false)
      expect(isValidVersion('1.0')).toBe(false)
    })

    it('should accept v-prefixed versions (semver coercion)', () => {
      expect(isValidVersion('v1.0.0')).toBe(true)
    })
  })

  describe('isNewerVersion', () => {
    it('should return true when candidate is higher', () => {
      expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true)
      expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true)
      expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    })

    it('should return false when candidate is lower', () => {
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false)
    })

    it('should return false when versions are equal', () => {
      expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    })

    it('should return false when either version is invalid', () => {
      expect(isNewerVersion('bad', '1.0.0')).toBe(false)
      expect(isNewerVersion('1.0.0', 'bad')).toBe(false)
      expect(isNewerVersion('bad', 'bad')).toBe(false)
    })
  })

  describe('sortVersionsDesc', () => {
    it('should sort valid versions in descending order', () => {
      expect(sortVersionsDesc(['1.0.0', '3.0.0', '2.0.0'])).toEqual([
        '3.0.0',
        '2.0.0',
        '1.0.0',
      ])
    })

    it('should filter out invalid versions', () => {
      expect(sortVersionsDesc(['1.0.0', 'bad', '2.0.0'])).toEqual([
        '2.0.0',
        '1.0.0',
      ])
    })

    it('should return empty for all-invalid input', () => {
      expect(sortVersionsDesc(['a', 'b', 'c'])).toEqual([])
    })

    it('should not mutate the input array', () => {
      const input = ['1.0.0', '3.0.0', '2.0.0']
      sortVersionsDesc(input)
      expect(input).toEqual(['1.0.0', '3.0.0', '2.0.0'])
    })
  })

  describe('findLatest', () => {
    it('should return the highest version', () => {
      expect(findLatest(['1.0.0', '3.0.0', '2.0.0'])).toBe('3.0.0')
    })

    it('should return null for empty array', () => {
      expect(findLatest([])).toBeNull()
    })

    it('should return null when no valid versions', () => {
      expect(findLatest(['bad', 'invalid'])).toBeNull()
    })
  })

  describe('findMaxSatisfying', () => {
    it('should find version matching range', () => {
      expect(findMaxSatisfying(['1.0.0', '2.0.0', '3.0.0'], '^2.0.0')).toBe(
        '2.0.0'
      )
    })

    it('should return null when no version matches', () => {
      expect(findMaxSatisfying(['1.0.0'], '^2.0.0')).toBeNull()
    })

    it('should handle complex ranges', () => {
      expect(
        findMaxSatisfying(
          ['1.5.0', '1.9.0', '2.0.0'],
          '>=1.5.0 <2.0.0'
        )
      ).toBe('1.9.0')
    })
  })
})
