export const SCOPE_OPTIONS = [
  { value: 'invocation', label: 'Invocation', description: 'Only during this run' },
  { value: 'project', label: 'Project', description: 'Within the current project' },
  { value: 'global', label: 'Global', description: 'Across all projects' },
] as const

export const ACTION_OPTIONS = [
  { value: '*', label: 'All Actions' },
  { value: 'read', label: 'Read' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
] as const

export const COMMON_RESOURCES = [
  { value: '*', label: 'All Resources', description: 'Full access to all resources' },
  { value: 'ticket', label: 'Tickets', description: 'Ticket entity (title, body, status)' },
  { value: 'ticket.*', label: 'All Ticket Fields', description: 'All fields on a ticket' },
  { value: 'ticket.status', label: 'Ticket Status', description: 'Open, closed, in progress, blocked' },
  { value: 'ticket.body', label: 'Ticket Body', description: 'Ticket description content' },
  { value: 'ticket.labels', label: 'Ticket Labels', description: 'Add or remove labels on tickets' },
  { value: 'comment', label: 'Comments', description: 'Ticket comments' },
  { value: 'label', label: 'Label Definitions', description: 'Create or manage label types (not yet enforced)' },
  { value: 'profile', label: 'Profiles', description: 'User and agent profiles' },
] as const

export const COMMON_TOOLS = [
  { value: '*', label: 'All Tools' },
  { value: 'mcp__kombuse__*', label: 'All Kombuse Tools' },
  { value: 'mcp__kombuse__get_ticket', label: 'Get Ticket' },
  { value: 'mcp__kombuse__get_ticket_comment', label: 'Get Ticket Comment' },
  { value: 'mcp__kombuse__add_comment', label: 'Add Comment' },
  { value: 'mcp__kombuse__update_ticket', label: 'Update Ticket' },
  { value: 'mcp__kombuse__create_ticket', label: 'Create Ticket' },
  { value: 'mcp__kombuse__search_tickets', label: 'Search Tickets' },
  { value: 'mcp__kombuse__list_tickets', label: 'List Tickets' },
  { value: 'mcp__kombuse__update_comment', label: 'Update Comment' },
  { value: 'mcp__kombuse__query_db', label: 'Query Database' },
  { value: 'Write', label: 'File Write' },
  { value: 'Edit', label: 'File Edit' },
  { value: 'Read', label: 'File Read' },
  { value: 'Bash', label: 'Bash Command' },
] as const

export function getResourceLabel(resource: string): string {
  return COMMON_RESOURCES.find((r) => r.value === resource)?.label ?? resource
}

export function getToolLabel(tool: string): string {
  return COMMON_TOOLS.find((t) => t.value === tool)?.label ?? tool
}

export function getScopeLabel(scope: string): string {
  return SCOPE_OPTIONS.find((s) => s.value === scope)?.label ?? scope
}

export function getActionLabel(action: string): string {
  return ACTION_OPTIONS.find((a) => a.value === action)?.label ?? action
}
