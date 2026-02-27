import { describe, it, expect } from 'vitest'
import type { SerializedAgentMessageEvent, ImageAttachment } from '@kombuse/types'
import { mergeEventsById } from '../event-merge-utils'

function makeMessageEvent(
  eventId: string,
  timestamp: number,
  overrides: Partial<SerializedAgentMessageEvent> = {}
): SerializedAgentMessageEvent {
  return {
    type: 'message',
    eventId,
    role: 'user',
    content: `content-${eventId}`,
    backend: 'mock',
    timestamp,
    ...overrides,
  }
}

const sampleImages: ImageAttachment[] = [
  { data: 'iVBORw0KGgoAAAANS', mediaType: 'image/png' },
]

describe('mergeEventsById', () => {
  describe('basic merge behavior', () => {
    it('returns incoming events when current is empty', () => {
      const incoming = [makeMessageEvent('evt-1', 100)]
      const result = mergeEventsById([], incoming, new Map())
      expect(result).toHaveLength(1)
      expect(result[0]!.eventId).toBe('evt-1')
    })

    it('preserves current events not present in incoming', () => {
      const current = [makeMessageEvent('evt-1', 100)]
      const incoming = [makeMessageEvent('evt-2', 200)]
      const result = mergeEventsById(current, incoming, new Map())
      expect(result).toHaveLength(2)
      expect(result.map((e) => e.eventId)).toEqual(['evt-1', 'evt-2'])
    })

    it('overwrites current event with incoming event of same eventId', () => {
      const current = [makeMessageEvent('evt-1', 100, { content: 'old' })]
      const incoming = [makeMessageEvent('evt-1', 100, { content: 'new' })]
      const result = mergeEventsById(current, incoming, new Map())
      expect(result).toHaveLength(1)
      expect((result[0] as SerializedAgentMessageEvent).content).toBe('new')
    })

    it('sorts by eventSequenceById when available', () => {
      const current = [makeMessageEvent('evt-1', 200)]
      const incoming = [makeMessageEvent('evt-2', 100)]
      const sequenceMap = new Map([
        ['evt-2', 0],
        ['evt-1', 1],
      ])
      const result = mergeEventsById(current, incoming, sequenceMap)
      expect(result.map((e) => e.eventId)).toEqual(['evt-2', 'evt-1'])
    })
  })

  describe('images preservation across merge', () => {
    it('preserves images from local event when server event lacks images field', () => {
      const current = [makeMessageEvent('evt-1', 100, { images: sampleImages })]
      const incoming = [makeMessageEvent('evt-1', 100)]
      const result = mergeEventsById(current, incoming, new Map())

      expect(result).toHaveLength(1)
      const merged = result[0] as SerializedAgentMessageEvent
      expect(merged.images).toEqual(sampleImages)
      // Rest of event comes from incoming
      expect(merged.content).toBe('content-evt-1')
    })

    it('uses server images when server event has images field', () => {
      const serverImages: ImageAttachment[] = [{ data: 'server-data', mediaType: 'image/jpeg' }]
      const current = [makeMessageEvent('evt-1', 100, { images: sampleImages })]
      const incoming = [makeMessageEvent('evt-1', 100, { images: serverImages })]
      const result = mergeEventsById(current, incoming, new Map())

      const merged = result[0] as SerializedAgentMessageEvent
      expect(merged.images).toEqual(serverImages)
    })

    it('does not inject images when neither local nor server has them', () => {
      const current = [makeMessageEvent('evt-1', 100)]
      const incoming = [makeMessageEvent('evt-1', 100, { content: 'updated' })]
      const result = mergeEventsById(current, incoming, new Map())

      const merged = result[0] as SerializedAgentMessageEvent
      expect(merged.images).toBeUndefined()
      expect(merged.content).toBe('updated')
    })

    it('preserves empty images array from local event', () => {
      const current = [makeMessageEvent('evt-1', 100, { images: [] })]
      const incoming = [makeMessageEvent('evt-1', 100)]
      const result = mergeEventsById(current, incoming, new Map())

      const merged = result[0] as SerializedAgentMessageEvent
      expect(merged.images).toEqual([])
    })

    it('preserves images across multiple sequential merges', () => {
      // Merge 1: local event with images arrives
      const merge1 = mergeEventsById(
        [],
        [makeMessageEvent('evt-1', 100, { images: sampleImages })],
        new Map()
      )
      expect((merge1[0] as SerializedAgentMessageEvent).images).toEqual(sampleImages)

      // Merge 2: server refetch overwrites without images — images should survive
      const merge2 = mergeEventsById(
        merge1,
        [makeMessageEvent('evt-1', 100)],
        new Map()
      )
      expect((merge2[0] as SerializedAgentMessageEvent).images).toEqual(sampleImages)

      // Merge 3: another server refetch — images still survive
      const merge3 = mergeEventsById(
        merge2,
        [makeMessageEvent('evt-1', 100)],
        new Map()
      )
      expect((merge3[0] as SerializedAgentMessageEvent).images).toEqual(sampleImages)
    })

    it('preserves images only on the correct event when merging multiple events', () => {
      const current = [
        makeMessageEvent('evt-1', 100, { images: sampleImages }),
        makeMessageEvent('evt-2', 200),
      ]
      const incoming = [
        makeMessageEvent('evt-1', 100),
        makeMessageEvent('evt-2', 200),
        makeMessageEvent('evt-3', 300),
      ]
      const result = mergeEventsById(current, incoming, new Map())

      expect(result).toHaveLength(3)
      expect((result[0] as SerializedAgentMessageEvent).images).toEqual(sampleImages)
      expect((result[1] as SerializedAgentMessageEvent).images).toBeUndefined()
      expect((result[2] as SerializedAgentMessageEvent).images).toBeUndefined()
    })
  })
})
