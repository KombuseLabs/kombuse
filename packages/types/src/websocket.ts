import type { ActorType } from './events'
import type { UpdateStatus } from './updates'

/**
 * WebSocket event payload sent to clients
 */
export interface WebSocketEvent {
  id: number
  event_type: string
  project_id: string | null
  ticket_id: number | null
  comment_id: number | null
  actor_id: string | null
  actor_type: ActorType
  payload: Record<string, unknown>
  created_at: string
}

/**
 * Client-to-server message types
 */
export type ClientMessage =
  | { type: 'subscribe'; topics: string[] }
  | { type: 'unsubscribe'; topics: string[] }
  | { type: 'ping' }

/**
 * Server-to-client message types
 */
export type ServerMessage =
  | { type: 'event'; topic: string; event: WebSocketEvent }
  | { type: 'subscribed'; topics: string[] }
  | { type: 'unsubscribed'; topics: string[] }
  | { type: 'pong' }
  | { type: 'error'; message: string }
  | { type: 'update:status'; status: UpdateStatus }

/**
 * Topic format examples:
 * - `project:{id}` - All events for a project
 * - `ticket:{id}` - All events for a specific ticket
 * - `*` - All events (admin/debug use)
 */
export type TopicPattern = `project:${string}` | `ticket:${number}` | '*'
