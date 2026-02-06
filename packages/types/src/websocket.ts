import type { ActorType } from './events'
import type { UpdateStatus } from './updates'
import type { SerializedAgentEvent } from './agent'

/**
 * Agent events streamed over websocket.
 * `complete` is represented by a dedicated `agent.complete` server message.
 */
export type AgentStreamEvent = Exclude<SerializedAgentEvent, { type: 'complete' }>

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
  | {
      type: 'agent.invoke'
      agentId?: string
      message: string
      kombuseSessionId?: string
      projectId?: string
    }
  | {
      type: 'permission.response'
      kombuseSessionId: string
      requestId: string
      behavior: 'allow' | 'deny'
      updatedInput?: Record<string, unknown>
      message?: string
    }

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
  | { type: 'agent.started'; kombuseSessionId: string }
  | { type: 'agent.event'; kombuseSessionId: string; event: AgentStreamEvent }
  | {
      type: 'agent.complete'
      kombuseSessionId: string
      backendSessionId?: string
    }
  | {
      type: 'agent.permission_pending'
      sessionId: string
      requestId: string
      toolName: string
      input: Record<string, unknown>
    }
  | {
      type: 'agent.permission_resolved'
      sessionId: string
      requestId: string
    }

/**
 * Topic format examples:
 * - `project:{id}` - All events for a project
 * - `ticket:{id}` - All events for a specific ticket
 * - `*` - All events (admin/debug use)
 */
export type TopicPattern = `project:${string}` | `ticket:${number}` | '*'
