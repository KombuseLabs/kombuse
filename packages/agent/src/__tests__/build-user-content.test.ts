import { describe, it, expect } from 'vitest'
import { buildUserContent, type MultimodalContentBlock } from '../backends/claude-code'

describe('buildUserContent', () => {
  it('returns plain string when no images provided', () => {
    expect(buildUserContent('hello')).toBe('hello')
  })

  it('returns plain string when images array is empty', () => {
    expect(buildUserContent('hello', [])).toBe('hello')
  })

  it('returns plain string when images is undefined', () => {
    expect(buildUserContent('hello', undefined)).toBe('hello')
  })

  it('returns multimodal blocks with text and image when both provided', () => {
    const images = [{ data: 'abc123', mediaType: 'image/png' }]
    const result = buildUserContent('describe this', images)

    expect(Array.isArray(result)).toBe(true)
    const blocks = result as MultimodalContentBlock[]
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'text', text: 'describe this' })
    expect(blocks[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
    })
  })

  it('omits text block when text is empty string', () => {
    const images = [{ data: 'abc123', mediaType: 'image/jpeg' }]
    const result = buildUserContent('', images)

    expect(Array.isArray(result)).toBe(true)
    const blocks = result as MultimodalContentBlock[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('image')
  })

  it('handles multiple images', () => {
    const images = [
      { data: 'img1data', mediaType: 'image/png' },
      { data: 'img2data', mediaType: 'image/jpeg' },
    ]
    const result = buildUserContent('two images', images)

    expect(Array.isArray(result)).toBe(true)
    const blocks = result as MultimodalContentBlock[]
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'text', text: 'two images' })
    expect(blocks[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'img1data' },
    })
    expect(blocks[2]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'img2data' },
    })
  })
})
