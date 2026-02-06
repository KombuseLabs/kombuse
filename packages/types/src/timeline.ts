import type { Event } from './events'
import type { CommentWithAuthor } from './comments'

/**
 * Type of item in the timeline
 */
export type TimelineItemType = 'comment' | 'event'

/**
 * A single item in the ticket timeline
 */
export interface TimelineItem {
  type: TimelineItemType
  timestamp: string
  data: CommentWithAuthor | Event
}

/**
 * Full ticket timeline response
 */
export interface TicketTimeline {
  items: TimelineItem[]
  total: number
}
