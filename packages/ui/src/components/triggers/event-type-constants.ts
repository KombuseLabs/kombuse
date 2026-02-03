export interface EventTypeOption {
  value: string
  label: string
  description: string
  category: 'ticket' | 'comment' | 'label' | 'mention'
}

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  // Ticket events
  {
    value: 'ticket.created',
    label: 'Ticket Created',
    description: 'When a new ticket is created',
    category: 'ticket',
  },
  {
    value: 'ticket.updated',
    label: 'Ticket Updated',
    description: 'When a ticket is modified',
    category: 'ticket',
  },
  {
    value: 'ticket.closed',
    label: 'Ticket Closed',
    description: 'When a ticket is closed',
    category: 'ticket',
  },
  {
    value: 'ticket.reopened',
    label: 'Ticket Reopened',
    description: 'When a closed ticket is reopened',
    category: 'ticket',
  },
  // Comment events
  {
    value: 'comment.added',
    label: 'Comment Added',
    description: 'When a comment is added to a ticket',
    category: 'comment',
  },
  {
    value: 'comment.edited',
    label: 'Comment Edited',
    description: 'When a comment is edited',
    category: 'comment',
  },
  // Label events
  {
    value: 'label.added',
    label: 'Label Added',
    description: 'When a label is added to a ticket',
    category: 'label',
  },
  {
    value: 'label.removed',
    label: 'Label Removed',
    description: 'When a label is removed from a ticket',
    category: 'label',
  },
  // Mention events
  {
    value: 'mention.created',
    label: 'Mention Created',
    description: 'When someone is mentioned',
    category: 'mention',
  },
]

export const EVENT_TYPE_CATEGORIES = ['ticket', 'comment', 'label', 'mention'] as const

export function getEventTypeOption(value: string): EventTypeOption | undefined {
  return EVENT_TYPE_OPTIONS.find((opt) => opt.value === value)
}
