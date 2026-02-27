import { EVENT_TYPES } from '@kombuse/types'

export interface EventTypeOption {
  value: string
  label: string
  description: string
  category: 'ticket' | 'comment' | 'label' | 'mention' | 'agent'
}

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  // Ticket events
  {
    value: EVENT_TYPES.TICKET_CREATED,
    label: 'Ticket Created',
    description: 'When a new ticket is created',
    category: 'ticket',
  },
  {
    value: EVENT_TYPES.TICKET_UPDATED,
    label: 'Ticket Updated',
    description: 'When a ticket is modified',
    category: 'ticket',
  },
  {
    value: EVENT_TYPES.TICKET_CLOSED,
    label: 'Ticket Closed',
    description: 'When a ticket is closed',
    category: 'ticket',
  },
  {
    value: EVENT_TYPES.TICKET_REOPENED,
    label: 'Ticket Reopened',
    description: 'When a closed ticket is reopened',
    category: 'ticket',
  },
  // Comment events
  {
    value: EVENT_TYPES.COMMENT_ADDED,
    label: 'Comment Added',
    description: 'When a comment is added to a ticket',
    category: 'comment',
  },
  {
    value: EVENT_TYPES.COMMENT_EDITED,
    label: 'Comment Edited',
    description: 'When a comment is edited',
    category: 'comment',
  },
  // Label events
  {
    value: EVENT_TYPES.LABEL_ADDED,
    label: 'Label Added',
    description: 'When a label is added to a ticket',
    category: 'label',
  },
  {
    value: EVENT_TYPES.LABEL_REMOVED,
    label: 'Label Removed',
    description: 'When a label is removed from a ticket',
    category: 'label',
  },
  // Mention events
  {
    value: EVENT_TYPES.MENTION_CREATED,
    label: 'Mention Created',
    description: 'When a @profile or #ticket mention is created',
    category: 'mention',
  },
  // Agent events
  {
    value: EVENT_TYPES.AGENT_COMPLETED,
    label: 'Agent Completed',
    description: 'When an agent completes its work on a ticket',
    category: 'agent',
  },
  {
    value: EVENT_TYPES.AGENT_STARTED,
    label: 'Agent Started',
    description: 'When an agent begins execution on a ticket',
    category: 'agent',
  },
  {
    value: EVENT_TYPES.AGENT_FAILED,
    label: 'Agent Failed',
    description: 'When an agent execution fails',
    category: 'agent',
  },
]

export const EVENT_TYPE_CATEGORIES = ['ticket', 'comment', 'label', 'mention', 'agent'] as const

export function getEventTypeOption(value: string): EventTypeOption | undefined {
  return EVENT_TYPE_OPTIONS.find((opt) => opt.value === value)
}
