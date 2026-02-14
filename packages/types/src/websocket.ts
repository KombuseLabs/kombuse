import type { ActorType } from './events'
import type { UpdateStatus } from './updates'
import type { SerializedAgentEvent } from './agent'
import type { AgentActivityStatus } from './app-context'
import type { BackendType } from './agent'

/**
 * Agent events streamed over websocket.
 * `complete` and internal `lifecycle` events are represented by dedicated server handling paths.
 */
export type AgentStreamEvent = Exclude<SerializedAgentEvent, { type: 'complete' | 'lifecycle' }>

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
      backendType?: BackendType
      /** Optional per-session model preference override for first invocation. */
      modelPreference?: string
    }
  | {
      type: 'permission.response'
      kombuseSessionId: string
      requestId: string
      behavior: 'allow' | 'deny'
      updatedInput?: Record<string, unknown>
      message?: string
    }
  | {
      type: 'agent.stop'
      kombuseSessionId: string
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
  | { type: 'agent.started'; kombuseSessionId: string; ticketId?: number; agentName?: string; startedAt?: string }
  | { type: 'agent.event'; kombuseSessionId: string; event: AgentStreamEvent }
  | {
      type: 'agent.complete'
      kombuseSessionId: string
      backendSessionId?: string
      ticketId?: number
      status?: 'completed' | 'failed' | 'aborted' | 'stopped'
      reason?: string
      errorMessage?: string
    }
  | {
      type: 'agent.permission_pending'
      permissionKey: string
      sessionId: string
      requestId: string
      toolName: string
      input: Record<string, unknown>
      /** Human-readable description of what this permission request will do */
      description?: string
      /** Ticket ID if this permission is for a ticket-triggered session */
      ticketId?: number
    }
  | {
      type: 'agent.permission_resolved'
      permissionKey: string
      sessionId: string
      requestId: string
    }
  | {
      type: 'ticket.agent_status'
      ticketId: number
      status: AgentActivityStatus
      sessionCount: number
    }

/**
 * Topic format examples:
 * - `project:{id}` - All events for a project
 * - `ticket:{id}` - All events for a specific ticket
 * - `session:{kombuseSessionId}` - All events for a specific session
 * - `*` - All events (admin/debug use)
 */
export type TopicPattern = `project:${string}` | `ticket:${number}` | `session:${string}` | '*'
