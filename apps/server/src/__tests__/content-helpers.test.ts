import { describe, it, expect } from 'vitest'
import { formatBytes, buildPersistedContent } from '../services/agent-execution-service/content-helpers'

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10240)).toBe('10.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})

describe('buildPersistedContent', () => {
  it('returns message as-is when no images', () => {
    expect(buildPersistedContent('hello')).toBe('hello')
  })

  it('returns message as-is when images is empty array', () => {
    expect(buildPersistedContent('hello', [])).toBe('hello')
  })

  it('returns message as-is when images is undefined', () => {
    expect(buildPersistedContent('hello', undefined)).toBe('hello')
  })

  it('appends image placeholders with mediaType and estimated size', () => {
    // Base64 data of length 1000 chars => ~750 bytes (0.75 factor)
    const images = [{ data: 'a'.repeat(1000), mediaType: 'image/png' }]
    const result = buildPersistedContent('check this', images)
    expect(result).toBe('check this\n[image: image/png, 750 B]')
  })

  it('handles empty message with images', () => {
    const images = [{ data: 'a'.repeat(2000), mediaType: 'image/jpeg' }]
    const result = buildPersistedContent('', images)
    expect(result).toBe('[image: image/jpeg, 1.5 KB]')
  })

  it('handles multiple images', () => {
    const images = [
      { data: 'a'.repeat(1000), mediaType: 'image/png' },
      { data: 'b'.repeat(2000), mediaType: 'image/jpeg' },
    ]
    const result = buildPersistedContent('two images', images)
    expect(result).toBe('two images\n[image: image/png, 750 B]\n[image: image/jpeg, 1.5 KB]')
  })
})
