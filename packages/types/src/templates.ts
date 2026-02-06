import type { ActorType } from './events'
import type { Ticket } from './tickets'
import type { Project } from './projects'
import type { Comment } from './comments'
import type { Profile } from './profiles'
import type { Label } from './labels'

/**
 * Context available for template interpolation.
 * Built from Event fields plus optional enriched entities.
 */
export interface TemplateContext {
  /** Event type, e.g., 'ticket.created' */
  event_type: string
  /** Ticket ID if available */
  ticket_id: number | null
  /** Project ID if available */
  project_id: string | null
  /** Comment ID if available */
  comment_id: number | null
  /** Actor (user/agent) ID if available */
  actor_id: string | null
  /** Actor type: 'user', 'agent', or 'system' */
  actor_type: ActorType
  /** Parsed event payload object */
  payload: Record<string, unknown>
  /** Full ticket entity if ticket_id is set */
  ticket?: TicketEnrichedContext | null
  /** Full project entity if project_id is set */
  project?: Project | null
  /** Full comment entity if comment_id is set */
  comment?: CommentEnrichedContext | null
  /** Actor profile if actor_id is set */
  actor?: Profile | null
}

/**
 * Ticket with nested relations for template access.
 */
export interface TicketEnrichedContext extends Ticket {
  author?: Profile | null
  assignee?: Profile | null
  labels?: Label[]
}

/**
 * Comment with nested author for template access.
 */
export interface CommentEnrichedContext extends Comment {
  author?: Profile | null
}
