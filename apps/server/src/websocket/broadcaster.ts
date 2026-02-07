import type { EventWithActor } from '@kombuse/types'
import { wsHub } from './hub'

/**
 * Broadcast an event to all subscribed WebSocket clients.
 * Call this after creating events in repositories.
 *
 * The event payload is parsed from JSON string if needed.
 */
export function broadcastEvent(event: EventWithActor): void {
  const payload = {
    ...event,
    payload:
      typeof event.payload === 'string'
        ? JSON.parse(event.payload)
        : event.payload,
  }
  wsHub.broadcast(payload)
}
