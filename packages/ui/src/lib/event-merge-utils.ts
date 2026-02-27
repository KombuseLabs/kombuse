import type { SerializedAgentEvent } from '@kombuse/types'

export function mergeEventsById(
  currentEvents: SerializedAgentEvent[],
  incomingEvents: SerializedAgentEvent[],
  eventSequenceById: Map<string, number>
): SerializedAgentEvent[] {
  const mergedByEventId = new Map(
    currentEvents.map((event) => [event.eventId, event] as const)
  )
  const fallbackOrderById = new Map(
    currentEvents.map((event, index) => [event.eventId, index] as const)
  )
  let nextFallbackOrder = currentEvents.length

  for (const incomingEvent of incomingEvents) {
    if (!fallbackOrderById.has(incomingEvent.eventId)) {
      fallbackOrderById.set(incomingEvent.eventId, nextFallbackOrder)
      nextFallbackOrder += 1
    }
    const existing = mergedByEventId.get(incomingEvent.eventId)
    if (existing && 'images' in existing && !('images' in incomingEvent)) {
      // Preserve client-only fields not persisted to server
      mergedByEventId.set(incomingEvent.eventId, { ...incomingEvent, images: (existing as any).images } as SerializedAgentEvent)
    } else {
      mergedByEventId.set(incomingEvent.eventId, incomingEvent)
    }
  }

  return [...mergedByEventId.values()].sort((a, b) => {
    const aSequence = eventSequenceById.get(a.eventId)
    const bSequence = eventSequenceById.get(b.eventId)
    if (aSequence !== undefined && bSequence !== undefined && aSequence !== bSequence) {
      return aSequence - bSequence
    }

    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp
    }

    const aFallbackOrder = fallbackOrderById.get(a.eventId) ?? Number.MAX_SAFE_INTEGER
    const bFallbackOrder = fallbackOrderById.get(b.eventId) ?? Number.MAX_SAFE_INTEGER
    return aFallbackOrder - bFallbackOrder
  })
}
