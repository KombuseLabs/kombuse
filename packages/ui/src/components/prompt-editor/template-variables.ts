export interface TemplateVariable {
  name: string
  description: string
  availability?: string
}

export interface TemplateVariableGroup {
  label: string
  variables: TemplateVariable[]
}

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    label: 'Event',
    variables: [
      {
        name: 'event_type',
        description: 'Event type, e.g. "ticket.created"',
        availability: 'Always available.',
      },
      {
        name: 'ticket_id',
        description: 'Ticket ID',
        availability: 'Always available; may be null when the event is not tied to a ticket.',
      },
      {
        name: 'project_id',
        description: 'Project ID',
        availability: 'Always available; may be null when the event is not tied to a project.',
      },
      {
        name: 'comment_id',
        description: 'Comment ID',
        availability: 'Always available; may be null when the event is not tied to a comment.',
      },
      {
        name: 'actor_id',
        description: 'Actor (user/agent) ID',
        availability: 'Always available; may be null when the event has no actor.',
      },
      {
        name: 'actor_type',
        description: '"user", "agent", or "system"',
        availability: 'Always available.',
      },
      {
        name: 'payload',
        description: 'Parsed event payload object',
        availability: 'Always available.',
      },
    ],
  },
  {
    label: 'Ticket',
    variables: [
      {
        name: 'ticket.title',
        description: 'Ticket title',
        availability: 'Available when `ticket_id` is present and a ticket can be loaded.',
      },
      {
        name: 'ticket.body',
        description: 'Ticket description body',
        availability: 'Available when `ticket_id` is present and a ticket can be loaded.',
      },
      {
        name: 'ticket.status',
        description: 'open, in_progress, blocked, closed',
        availability: 'Available when `ticket_id` is present and a ticket can be loaded.',
      },
      {
        name: 'ticket.priority',
        description: 'Priority level (0-4)',
        availability: 'Available when `ticket_id` is present and a ticket can be loaded.',
      },
      {
        name: 'ticket.author.name',
        description: 'Ticket author name',
        availability:
          'Available when `ticket_id` is present and the ticket author profile can be loaded.',
      },
      {
        name: 'ticket.assignee.name',
        description: 'Ticket assignee name',
        availability:
          'Available when `ticket_id` is present and the ticket has an assignee profile.',
      },
      {
        name: 'ticket.labels',
        description: 'Array of assigned labels',
        availability:
          'Available when `ticket_id` is present and a ticket can be loaded (array may be empty).',
      },
    ],
  },
  {
    label: 'Project',
    variables: [
      {
        name: 'project.name',
        description: 'Project name',
        availability: 'Available when `project_id` is present and a project can be loaded.',
      },
      {
        name: 'project.description',
        description: 'Project description',
        availability: 'Available when `project_id` is present and a project can be loaded.',
      },
    ],
  },
  {
    label: 'Comment',
    variables: [
      {
        name: 'comment.body',
        description: 'Comment text content',
        availability: 'Available when `comment_id` is present and a comment can be loaded.',
      },
      {
        name: 'comment.author.name',
        description: 'Comment author name',
        availability:
          'Available when `comment_id` is present and the comment author profile can be loaded.',
      },
    ],
  },
  {
    label: 'Actor',
    variables: [
      {
        name: 'actor.name',
        description: 'Actor display name',
        availability: 'Available when `actor_id` is present and an actor profile can be loaded.',
      },
      {
        name: 'actor.email',
        description: 'Actor email address',
        availability:
          'Available when `actor_id` is present and an actor profile with an email is available.',
      },
    ],
  },
  {
    label: 'Session',
    variables: [
      {
        name: 'kombuse_session_id',
        description: 'Session ID for linking agent actions',
        availability: 'Available when the invocation is linked to a Kombuse session.',
      },
      {
        name: 'agents',
        description: 'Array of active agent profiles ({id, name})',
        availability: 'Available when active agent profiles are loaded into template context.',
      },
    ],
  },
]
