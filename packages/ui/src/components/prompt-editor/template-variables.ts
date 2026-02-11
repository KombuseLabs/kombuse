export interface TemplateVariable {
  name: string
  description: string
}

export interface TemplateVariableGroup {
  label: string
  variables: TemplateVariable[]
}

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    label: 'Event',
    variables: [
      { name: 'event_type', description: 'Event type, e.g. "ticket.created"' },
      { name: 'ticket_id', description: 'Ticket ID' },
      { name: 'project_id', description: 'Project ID' },
      { name: 'comment_id', description: 'Comment ID' },
      { name: 'actor_id', description: 'Actor (user/agent) ID' },
      { name: 'actor_type', description: '"user", "agent", or "system"' },
      { name: 'payload', description: 'Parsed event payload object' },
    ],
  },
  {
    label: 'Ticket',
    variables: [
      { name: 'ticket.title', description: 'Ticket title' },
      { name: 'ticket.body', description: 'Ticket description body' },
      { name: 'ticket.status', description: 'open, in_progress, blocked, closed' },
      { name: 'ticket.priority', description: 'Priority level (0-4)' },
      { name: 'ticket.author.name', description: 'Ticket author name' },
      { name: 'ticket.assignee.name', description: 'Ticket assignee name' },
      { name: 'ticket.labels', description: 'Array of assigned labels' },
    ],
  },
  {
    label: 'Project',
    variables: [
      { name: 'project.name', description: 'Project name' },
      { name: 'project.description', description: 'Project description' },
    ],
  },
  {
    label: 'Comment',
    variables: [
      { name: 'comment.body', description: 'Comment text content' },
      { name: 'comment.author.name', description: 'Comment author name' },
    ],
  },
  {
    label: 'Actor',
    variables: [
      { name: 'actor.name', description: 'Actor display name' },
      { name: 'actor.email', description: 'Actor email address' },
    ],
  },
  {
    label: 'Session',
    variables: [
      { name: 'kombuse_session_id', description: 'Session ID for linking agent actions' },
      { name: 'agents', description: 'Array of active agent profiles ({id, name})' },
    ],
  },
]
