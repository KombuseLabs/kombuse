import type { JsonObject } from '@kombuse/types'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Cable,
  Database,
  FolderKanban,
  MessageSquare,
  Search,
  Table2,
  Tags,
  Ticket,
  UserCog,
  UserPlus,
  Wrench,
} from 'lucide-react'

const KOMBUSE_TOOL_PREFIX = 'mcp__kombuse__'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return current
}

function readNumber(value: unknown, path: string[]): number | null {
  const nested = getNestedValue(value, path)
  return typeof nested === 'number' ? nested : null
}

function readString(value: unknown, path: string[]): string | null {
  const nested = getNestedValue(value, path)
  return typeof nested === 'string' ? nested : null
}

function readArrayLength(value: unknown, path: string[]): number | null {
  const nested = getNestedValue(value, path)
  return Array.isArray(nested) ? nested.length : null
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function joinSummary(parts: Array<string | null | undefined>): string | null {
  const filtered = parts.filter((part): part is string => Boolean(part && part.length > 0))
  return filtered.length > 0 ? filtered.join(' · ') : null
}

function summarizeCount(output: unknown, numberPath: string[], arrayPath: string[], noun: string): string | null {
  const countFromNumber = readNumber(output, numberPath)
  if (countFromNumber != null) return pluralize(countFromNumber, noun)

  const countFromArray = readArrayLength(output, arrayPath)
  if (countFromArray != null) return pluralize(countFromArray, noun)

  return null
}

function summarizeUpdateTicketFields(input: JsonObject): string | null {
  const fields: string[] = []
  if (typeof input.status === 'string') fields.push(`status=${input.status}`)
  if (typeof input.title === 'string') fields.push('title')
  if (typeof input.body === 'string') fields.push('body')
  if (typeof input.priority === 'number') fields.push(`priority=${input.priority}`)
  if (input.assignee_id !== undefined) fields.push('assignee')
  if (Array.isArray(input.add_label_ids) && input.add_label_ids.length > 0) fields.push('labels+')
  if (Array.isArray(input.remove_label_ids) && input.remove_label_ids.length > 0) fields.push('labels-')
  return fields.length > 0 ? truncate(fields.join(', '), 48) : null
}

function summarizeUnknownTool(input: JsonObject, output: unknown, hasResult: boolean): string | null {
  if (hasResult) {
    const count = readNumber(output, ['count']) ?? readNumber(output, ['total'])
    if (count != null) return pluralize(count, 'item')
  }
  const keys = Object.keys(input)
  if (keys.length === 0) return null
  return `${keys.length} input ${keys.length === 1 ? 'field' : 'fields'}`
}

function formatUnknownToolLabel(name: string): string {
  const suffix = name.startsWith(KOMBUSE_TOOL_PREFIX) ? name.slice(KOMBUSE_TOOL_PREFIX.length) : name
  return suffix
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

export interface KombuseSummaryContext {
  input: JsonObject
  output: unknown
  hasResult: boolean
  isError: boolean
}

export interface KombuseToolConfig {
  label: string
  icon: LucideIcon
  summarize: (context: KombuseSummaryContext) => string | null
}

const KOMBUSE_TOOL_CONFIGS: Record<string, KombuseToolConfig> = {
  mcp__kombuse__get_ticket: {
    label: 'Get ticket',
    icon: Ticket,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.ticket_id === 'number' ? `#${input.ticket_id}` : null,
        hasResult ? summarizeCount(output, ['overview', 'total_comments'], ['comments'], 'comment') : null,
      ]),
  },
  mcp__kombuse__get_ticket_comment: {
    label: 'Get ticket comment',
    icon: MessageSquare,
    summarize: ({ input }) =>
      typeof input.comment_id === 'number' ? `#${input.comment_id}` : null,
  },
  mcp__kombuse__add_comment: {
    label: 'Add comment',
    icon: MessageSquare,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.ticket_id === 'number' ? `ticket #${input.ticket_id}` : null,
        hasResult && typeof readNumber(output, ['id']) === 'number' ? `comment #${readNumber(output, ['id'])}` : null,
      ]),
  },
  mcp__kombuse__create_ticket: {
    label: 'Create ticket',
    icon: Ticket,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.title === 'string' ? truncate(input.title, 40) : null,
        hasResult && typeof readNumber(output, ['id']) === 'number' ? `#${readNumber(output, ['id'])}` : null,
      ]),
  },
  mcp__kombuse__update_comment: {
    label: 'Update comment',
    icon: MessageSquare,
    summarize: ({ input }) =>
      typeof input.comment_id === 'number' ? `#${input.comment_id}` : null,
  },
  mcp__kombuse__list_tickets: {
    label: 'List tickets',
    icon: Ticket,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.status === 'string' ? `status=${input.status}` : null,
        typeof input.project_id === 'string' ? `project ${input.project_id}` : null,
        hasResult ? summarizeCount(output, ['count'], ['tickets'], 'ticket') : null,
      ]),
  },
  mcp__kombuse__search_tickets: {
    label: 'Search tickets',
    icon: Search,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.query === 'string' ? `"${truncate(input.query, 28)}"` : null,
        hasResult ? summarizeCount(output, ['count'], ['tickets'], 'match') : null,
      ]),
  },
  mcp__kombuse__list_projects: {
    label: 'List projects',
    icon: FolderKanban,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.search === 'string' ? `"${truncate(input.search, 24)}"` : null,
        hasResult ? summarizeCount(output, ['count'], ['projects'], 'project') : null,
      ]),
  },
  mcp__kombuse__list_labels: {
    label: 'List labels',
    icon: Tags,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.project_id === 'string' ? `project ${input.project_id}` : null,
        hasResult ? summarizeCount(output, ['count'], ['labels'], 'label') : null,
      ]),
  },
  mcp__kombuse__update_ticket: {
    label: 'Update ticket',
    icon: Ticket,
    summarize: ({ input }) =>
      joinSummary([
        typeof input.ticket_id === 'number' ? `#${input.ticket_id}` : null,
        summarizeUpdateTicketFields(input),
      ]),
  },
  mcp__kombuse__query_db: {
    label: 'Query DB',
    icon: Database,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.sql === 'string' ? truncate(input.sql.replace(/\s+/g, ' '), 50) : null,
        hasResult ? summarizeCount(output, ['count'], ['rows'], 'row') : null,
      ]),
  },
  mcp__kombuse__list_tables: {
    label: 'List tables',
    icon: Table2,
    summarize: ({ output, hasResult }) =>
      hasResult ? summarizeCount(output, ['count'], ['tables'], 'table') : null,
  },
  mcp__kombuse__describe_table: {
    label: 'Describe table',
    icon: Table2,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.table_name === 'string' ? input.table_name : null,
        hasResult ? summarizeCount(output, ['count'], ['columns'], 'column') : null,
      ]),
  },
  mcp__kombuse__list_api_endpoints: {
    label: 'List API endpoints',
    icon: Cable,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.method === 'string' ? input.method : null,
        hasResult ? summarizeCount(output, ['total'], ['endpoints'], 'endpoint') : null,
      ]),
  },
  mcp__kombuse__call_api: {
    label: 'Call API',
    icon: Cable,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.path === 'string' ? truncate(input.path, 36) : null,
        hasResult && typeof readNumber(output, ['status']) === 'number' ? `status ${readNumber(output, ['status'])}` : null,
      ]),
  },
  mcp__kombuse__list_agents: {
    label: 'List agents',
    icon: Bot,
    summarize: ({ output, hasResult }) =>
      hasResult ? summarizeCount(output, ['count'], ['agents'], 'agent') : null,
  },
  mcp__kombuse__create_agent: {
    label: 'Create agent',
    icon: UserPlus,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.name === 'string' ? truncate(input.name, 32) : null,
        hasResult && typeof readString(output, ['id']) === 'string' ? readString(output, ['id']) : null,
      ]),
  },
  mcp__kombuse__update_agent: {
    label: 'Update agent',
    icon: UserCog,
    summarize: ({ input, output, hasResult }) =>
      joinSummary([
        typeof input.agent_id === 'string' ? input.agent_id : null,
        hasResult && typeof readString(output, ['id']) === 'string' ? readString(output, ['id']) : null,
      ]),
  },
}

export const KNOWN_KOMBUSE_TOOL_NAMES = Object.keys(KOMBUSE_TOOL_CONFIGS)

export function isKombuseToolName(name: string): boolean {
  return name.startsWith(KOMBUSE_TOOL_PREFIX)
}

export function getKombuseToolConfig(name: string): KombuseToolConfig {
  const known = KOMBUSE_TOOL_CONFIGS[name]
  if (known) return known

  return {
    label: formatUnknownToolLabel(name),
    icon: Wrench,
    summarize: ({ input, output, hasResult }) => summarizeUnknownTool(input, output, hasResult),
  }
}
