import type { AgentFilters, LabelFilters, SessionFilters, TicketFilters } from '@kombuse/types'

type ProjectLabelListOptions = Pick<LabelFilters, 'search' | 'sort' | 'usage_scope' | 'is_enabled'>

export const ticketKeys = {
  all: ['tickets'] as const,
  list: (filters?: TicketFilters) => ['tickets', filters] as const,
  byNumber: (projectId: string | undefined, ticketNumber: number) =>
    ['tickets', 'by-number', projectId, ticketNumber] as const,
  counts: (projectId: string) => ['tickets', 'counts', projectId] as const,
  search: (query: string, projectId: string | null) =>
    ['tickets', 'search', query, projectId] as const,
}

export const commentKeys = {
  all: ['comments'] as const,
  list: (projectId: string, ticketNumber: number, filters?: unknown) =>
    ['comments', projectId, ticketNumber, filters] as const,
  // Singular 'comment' — intentional, matches existing cache keys
  detail: (id: number) => ['comment', id] as const,
}

export const ticketTimelineKeys = {
  all: ['ticket-timeline'] as const,
  detail: (projectId: string, ticketNumber: number) =>
    ['ticket-timeline', projectId, ticketNumber] as const,
}

export const labelKeys = {
  all: ['labels'] as const,
  project: (
    projectId: string,
    options?: ProjectLabelListOptions | null,
  ) => {
    if (options) {
      const search = options.search ?? null
      const sort = options.sort ?? null
      const usageScope = options.usage_scope ?? null
      const isEnabled = options.is_enabled ?? null
      return ['labels', 'project', projectId, { search, sort, usageScope, isEnabled }] as const
    }
    return ['labels', 'project', projectId] as const
  },
  ticket: (projectId: string, ticketNumber: number) =>
    ['labels', 'ticket', projectId, ticketNumber] as const,
}

export const agentKeys = {
  all: ['agents'] as const,
  list: (filters?: AgentFilters) => ['agents', filters] as const,
  detail: (id: string) => ['agents', id] as const,
  withProfile: (id: string) => ['agents', id, 'with-profile'] as const,
}

export const profileKeys = {
  all: ['profiles'] as const,
  detail: (id: string) => ['profiles', id] as const,
  search: (query: string, projectId: string | undefined) =>
    ['profiles', 'search', query, projectId] as const,
  agentProfiles: () => ['profiles', { type: 'agent' }] as const,
}

export const sessionKeys = {
  all: ['sessions'] as const,
  list: (filters?: SessionFilters) => ['sessions', filters] as const,
  byKombuse: (kombuseSessionId: string | null) =>
    ['sessions', 'by-kombuse', kombuseSessionId] as const,
  events: (kombuseSessionId: string | null, filters?: unknown) =>
    ['sessions', kombuseSessionId, 'events', filters] as const,
}

export const projectKeys = {
  all: ['projects'] as const,
  list: (filters?: unknown) => ['projects', filters] as const,
  detail: (id: string) => ['projects', id] as const,
}

export const milestoneKeys = {
  all: ['milestones'] as const,
  project: (projectId: string) =>
    ['milestones', 'project', projectId] as const,
  detail: (id: number) => ['milestones', id] as const,
}

export const triggerKeys = {
  all: ['triggers'] as const,
  byAgent: (agentId: string) => ['triggers', agentId] as const,
  detail: (id: number) => ['triggers', 'detail', id] as const,
  byLabel: (labelId: number) => ['triggers', 'label', labelId] as const,
}

export const analyticsKeys = {
  sessionsPerDay: (projectId: string, days?: number) =>
    ['analytics', 'sessions-per-day', projectId, days] as const,
  durationPercentiles: (projectId: string, days?: number) =>
    ['analytics', 'duration-percentiles', projectId, days] as const,
  pipelineStageDuration: (projectId: string, days?: number) =>
    ['analytics', 'pipeline-stage-duration', projectId, days] as const,
  mostFrequentReads: (projectId: string, days?: number, limit?: number) =>
    ['analytics', 'most-frequent-reads', projectId, days, limit] as const,
  toolCallsPerSession: (projectId: string, days?: number, agentId?: string) =>
    ['analytics', 'tool-calls-per-session', projectId, days, agentId] as const,
  slowestTools: (projectId: string, days?: number) =>
    ['analytics', 'slowest-tools', projectId, days] as const,
  toolCallVolume: (projectId: string, days?: number) =>
    ['analytics', 'tool-call-volume', projectId, days] as const,
  ticketBurndown: (projectId: string, days?: number, milestoneId?: number, labelId?: number) =>
    ['analytics', 'ticket-burndown', projectId, days, milestoneId, labelId] as const,
  agentRuntimePerTicket: (projectId: string, limit?: number) =>
    ['analytics', 'agent-runtime-per-ticket', projectId, limit] as const,
}

export const pluginKeys = {
  all: ['plugins'] as const,
  installed: (projectId: string) => ['plugins', 'installed', projectId] as const,
  available: (projectId: string) => ['plugins', 'available', projectId] as const,
  checkUpdates: (pluginId: string | null | undefined) =>
    ['plugins', 'check-updates', pluginId] as const,
}

export const pluginFileKeys = {
  all: ['plugin-files'] as const,
  list: (pluginId: string | null | undefined) => ['plugin-files', pluginId] as const,
}

export const pluginSourceKeys = {
  all: ['plugin-sources'] as const,
  list: (projectId: string) => ['plugin-sources', projectId] as const,
}

export const permissionKeys = {
  list: (projectId: string, filters?: unknown) =>
    ['permissions', projectId, filters] as const,
}

export const eventKeys = {
  list: (filters?: unknown) => ['events', filters] as const,
}

export const databaseKeys = {
  tables: () => ['database', 'tables'] as const,
  query: (input?: unknown) => ['database', 'query', input] as const,
}

export const modelKeys = {
  list: (backendType: string | undefined) => ['models', backendType] as const,
}

export const profileSettingKeys = {
  all: (profileId: string) => ['profile-settings', profileId] as const,
  detail: (profileId: string, key: string) =>
    ['profile-settings', profileId, key] as const,
}

export const backendStatusKeys = {
  all: ['backend-status'] as const,
}

export const updateKeys = {
  status: ['updates', 'status'] as const,
  shellStatus: ['shell-updates', 'status'] as const,
}

export const claudeCodeKeys = {
  projects: ['claude-code-projects'] as const,
  sessions: (projectPath: string) =>
    ['claude-code-sessions', projectPath] as const,
  sessionContent: (projectPath: string, sessionId: string) =>
    ['claude-code-session-content', projectPath, sessionId] as const,
  mcpStatus: ['claude-code-mcp-status'] as const,
}

export const codexKeys = {
  mcpStatus: ['codex-mcp-status'] as const,
}

export const attachmentKeys = {
  comment: (commentId: number) => ['comment-attachments', commentId] as const,
  ticket: (projectId: string, ticketNumber: number) =>
    ['ticket-attachments', projectId, ticketNumber] as const,
}
