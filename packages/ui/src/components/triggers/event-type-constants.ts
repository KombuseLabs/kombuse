export interface EventTypeOption {
  value: string
  label: string
  description: string
  category: 'ticket' | 'comment' | 'label' | 'mention' | 'agent'
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
    description: 'When a @profile or #ticket mention is created',
    category: 'mention',
  },
  // Agent events
  {
    value: 'agent.completed',
    label: 'Agent Completed',
    description: 'When an agent completes its work on a ticket',
    category: 'agent',
  },
  {
    value: 'agent.started',
    label: 'Agent Started',
    description: 'When an agent begins execution on a ticket',
    category: 'agent',
  },
  {
    value: 'agent.failed',
    label: 'Agent Failed',
    description: 'When an agent execution fails',
    category: 'agent',
  },
]

export const EVENT_TYPE_CATEGORIES = ['ticket', 'comment', 'label', 'mention', 'agent'] as const

export function getEventTypeOption(value: string): EventTypeOption | undefined {
  return EVENT_TYPE_OPTIONS.find((opt) => opt.value === value)
}
