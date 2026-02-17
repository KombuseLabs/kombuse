import type {
  Ticket,
  TicketStatusCounts,
  TicketWithRelations,
  TicketWithLabels,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  CommentWithAuthor,
  CreateCommentInput,
  UpdateCommentInput,
  CommentFilters,
  Label,
  LabelFilters,
  CreateLabelInput,
  UpdateLabelInput,
  Agent,
  AgentFilters,
  CreateAgentInput,
  UpdateAgentInput,
  AgentTrigger,
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
  Profile,
  ProfileFilters,
  CreateProfileInput,
  UpdateProfileInput,
  Project,
  ProjectFilters,
  CreateProjectInput,
  UpdateProjectInput,
  ClaudeCodeProjectWithStatus,
  EventWithActor,
  EventFilters,
  PublicSession,
  SessionFilters,
  SessionEvent,
  TicketTimeline,
  Attachment,
  PendingPermission,
  AgentActivityStatus,
  SerializedAgentEvent,
  PermissionLogEntry,
  PermissionLogFilters,
  ProfileSetting,
  UpsertProfileSettingInput,
  Milestone,
  MilestoneWithStats,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  BackendType,
  CodexMcpStatus,
  DatabaseTablesResponse,
  DatabaseQueryInput,
  DatabaseQueryResponse,
  ModelCatalogResponse,
  BackendStatus,
  AgentExportResult,
} from '@kombuse/types'

declare global {
  interface Window {
    electron?: {
      serverPort?: number
      restart?: () => Promise<void>
      selectDirectory?: () => Promise<string | null>
      platform?: string
    }
  }
}

export function getServerPort(): number {
  return window.electron?.serverPort ?? 3332
}

export function getWsUrl(): string {
  return `ws://localhost:${getServerPort()}/ws`
}

const API_BASE = `http://localhost:${getServerPort()}/api`

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = errorData.error
      ? Array.isArray(errorData.error)
        ? errorData.error.map((e: { message?: string }) => e.message).join(', ')
        : String(errorData.error)
      : `HTTP error! status: ${response.status}`
    throw new Error(message)
  }
  return response.json()
}

async function handleEmptyResponse(response: Response): Promise<void> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = errorData.error
      ? Array.isArray(errorData.error)
        ? errorData.error.map((e: { message?: string }) => e.message).join(', ')
        : String(errorData.error)
      : `HTTP error! status: ${response.status}`
    throw new Error(message)
  }
}

export const ticketsApi = {
  async list(filters?: TicketFilters): Promise<TicketWithLabels[]> {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.priority !== undefined)
      params.set('priority', String(filters.priority))
    if (filters?.project_id) params.set('project_id', filters.project_id)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))
    if (filters?.label_ids?.length)
      params.set('label_ids', filters.label_ids.join(','))
    if (filters?.milestone_id)
      params.set('milestone_id', String(filters.milestone_id))
    if (filters?.sort_by) params.set('sort_by', filters.sort_by)
    if (filters?.sort_order) params.set('sort_order', filters.sort_order)
    if (filters?.viewer_id) params.set('viewer_id', filters.viewer_id)

    const url = `${API_BASE}/tickets${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<TicketWithLabels[]>(response)
  },

  async get(id: number): Promise<TicketWithRelations> {
    const response = await fetch(`${API_BASE}/tickets/${id}`)
    return handleResponse<TicketWithRelations>(response)
  },

  async markViewed(id: number, profileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/tickets/${id}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    })
    await handleResponse(response)
  },

  async create(input: CreateTicketInput): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Ticket>(response)
  },

  async update(id: number, input: UpdateTicketInput): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Ticket>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async statusCounts(projectId: string): Promise<TicketStatusCounts> {
    const response = await fetch(`${API_BASE}/tickets/counts?project_id=${encodeURIComponent(projectId)}`)
    return handleResponse<TicketStatusCounts>(response)
  },
}

export const commentsApi = {
  async get(id: number): Promise<CommentWithAuthor> {
    const response = await fetch(`${API_BASE}/comments/${id}`)
    return handleResponse<CommentWithAuthor>(response)
  },

  async list(ticketId: number, filters?: CommentFilters): Promise<CommentWithAuthor[]> {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/tickets/${ticketId}/comments${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<CommentWithAuthor[]>(response)
  },

  async create(
    ticketId: number,
    input: Omit<CreateCommentInput, 'ticket_id'>
  ): Promise<CommentWithAuthor> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<CommentWithAuthor>(response)
  },

  async update(id: number, input: UpdateCommentInput): Promise<CommentWithAuthor> {
    const response = await fetch(`${API_BASE}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<CommentWithAuthor>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/comments/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const labelsApi = {
  async listByProject(projectId: string, filters?: Pick<LabelFilters, 'search' | 'sort' | 'usage_scope'>): Promise<Label[]> {
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.sort) params.set('sort', filters.sort)
    if (filters?.usage_scope) params.set('usage_scope', filters.usage_scope)

    const url = `${API_BASE}/projects/${projectId}/labels${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Label[]>(response)
  },

  async getTicketLabels(ticketId: number): Promise<Label[]> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/labels`)
    return handleResponse<Label[]>(response)
  },

  async addToTicket(
    ticketId: number,
    labelId: number,
    addedById?: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/tickets/${ticketId}/labels/${labelId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added_by_id: addedById }),
      }
    )
    await handleEmptyResponse(response)
  },

  async removeFromTicket(ticketId: number, labelId: number, removedById?: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/tickets/${ticketId}/labels/${labelId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removed_by_id: removedById }),
      }
    )
    await handleEmptyResponse(response)
  },

  async create(
    projectId: string,
    input: Omit<CreateLabelInput, 'project_id'>
  ): Promise<Label> {
    const response = await fetch(`${API_BASE}/projects/${projectId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Label>(response)
  },

  async update(id: number, input: UpdateLabelInput): Promise<Label> {
    const response = await fetch(`${API_BASE}/labels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Label>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/labels/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const milestonesApi = {
  async listByProject(projectId: string): Promise<MilestoneWithStats[]> {
    const response = await fetch(`${API_BASE}/projects/${projectId}/milestones`)
    return handleResponse<MilestoneWithStats[]>(response)
  },

  async get(id: number): Promise<MilestoneWithStats> {
    const response = await fetch(`${API_BASE}/milestones/${id}`)
    return handleResponse<MilestoneWithStats>(response)
  },

  async create(
    projectId: string,
    input: Omit<CreateMilestoneInput, 'project_id'>
  ): Promise<Milestone> {
    const response = await fetch(`${API_BASE}/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Milestone>(response)
  },

  async update(id: number, input: UpdateMilestoneInput): Promise<Milestone> {
    const response = await fetch(`${API_BASE}/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Milestone>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/milestones/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const agentsApi = {
  async list(filters?: AgentFilters): Promise<Agent[]> {
    const params = new URLSearchParams()
    if (filters?.is_enabled !== undefined)
      params.set('is_enabled', String(filters.is_enabled))
    if (filters?.enabled_for_chat !== undefined)
      params.set('enabled_for_chat', String(filters.enabled_for_chat))
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/agents${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Agent[]>(response)
  },

  async get(id: string): Promise<Agent> {
    const response = await fetch(`${API_BASE}/agents/${id}`)
    return handleResponse<Agent>(response)
  },

  async create(input: CreateAgentInput): Promise<Agent> {
    const response = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Agent>(response)
  },

  async update(id: string, input: UpdateAgentInput): Promise<Agent> {
    const response = await fetch(`${API_BASE}/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Agent>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/agents/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async export(input: { directory: string; agent_ids?: string[] }): Promise<AgentExportResult> {
    const response = await fetch(`${API_BASE}/agents/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<AgentExportResult>(response)
  },
}

export const profilesApi = {
  async list(filters?: ProfileFilters): Promise<Profile[]> {
    const params = new URLSearchParams()
    if (filters?.type) params.set('type', filters.type)
    if (filters?.is_active !== undefined)
      params.set('is_active', String(filters.is_active))
    if (filters?.search) params.set('search', filters.search)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/profiles${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Profile[]>(response)
  },

  async get(id: string): Promise<Profile> {
    const response = await fetch(`${API_BASE}/profiles/${id}`)
    return handleResponse<Profile>(response)
  },

  async create(input: CreateProfileInput): Promise<Profile> {
    const response = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Profile>(response)
  },

  async update(id: string, input: UpdateProfileInput): Promise<Profile> {
    const response = await fetch(`${API_BASE}/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Profile>(response)
  },
}

export const triggersApi = {
  async list(agentId: string): Promise<AgentTrigger[]> {
    const response = await fetch(`${API_BASE}/agents/${agentId}/triggers`)
    return handleResponse<AgentTrigger[]>(response)
  },

  async get(id: number): Promise<AgentTrigger> {
    const response = await fetch(`${API_BASE}/triggers/${id}`)
    return handleResponse<AgentTrigger>(response)
  },

  async create(
    agentId: string,
    input: Omit<CreateAgentTriggerInput, 'agent_id'>
  ): Promise<AgentTrigger> {
    const response = await fetch(`${API_BASE}/agents/${agentId}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<AgentTrigger>(response)
  },

  async update(id: number, input: UpdateAgentTriggerInput): Promise<AgentTrigger> {
    const response = await fetch(`${API_BASE}/triggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<AgentTrigger>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/triggers/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async listByLabel(labelId: number): Promise<AgentTrigger[]> {
    const response = await fetch(`${API_BASE}/labels/${labelId}/triggers`)
    return handleResponse<AgentTrigger[]>(response)
  },
}

export const projectsApi = {
  async list(filters?: ProjectFilters): Promise<Project[]> {
    const params = new URLSearchParams()
    if (filters?.owner_id) params.set('owner_id', filters.owner_id)
    if (filters?.repo_source) params.set('repo_source', filters.repo_source)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/projects${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Project[]>(response)
  },

  async get(id: string): Promise<Project> {
    const response = await fetch(`${API_BASE}/projects/${id}`)
    return handleResponse<Project>(response)
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Project>(response)
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Project>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const eventsApi = {
  async list(filters?: EventFilters): Promise<EventWithActor[]> {
    const params = new URLSearchParams()
    if (filters?.event_type) params.set('event_type', filters.event_type)
    if (filters?.project_id) params.set('project_id', filters.project_id)
    if (filters?.ticket_id) params.set('ticket_id', String(filters.ticket_id))
    if (filters?.actor_id) params.set('actor_id', filters.actor_id)
    if (filters?.actor_type) params.set('actor_type', filters.actor_type)
    if (filters?.since) params.set('since', filters.since)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/events${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<EventWithActor[]>(response)
  },
}

export const permissionsApi = {
  async list(
    projectId: string,
    filters?: Omit<PermissionLogFilters, 'project_id'>
  ): Promise<PermissionLogEntry[]> {
    const params = new URLSearchParams()
    if (filters?.tool_name) params.set('tool_name', filters.tool_name)
    if (filters?.behavior) params.set('behavior', filters.behavior)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/projects/${projectId}/permissions${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<PermissionLogEntry[]>(response)
  },
}

export const databaseApi = {
  async listTables(): Promise<DatabaseTablesResponse> {
    const response = await fetch(`${API_BASE}/database/tables`)
    return handleResponse<DatabaseTablesResponse>(response)
  },

  async query(input: DatabaseQueryInput): Promise<DatabaseQueryResponse> {
    const response = await fetch(`${API_BASE}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<DatabaseQueryResponse>(response)
  },
}

export const timelineApi = {
  async getTicketTimeline(ticketId: number): Promise<TicketTimeline> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/timeline`)
    return handleResponse<TicketTimeline>(response)
  },
}

type SessionDiagnostics = {
  generated_at: string
  counts_by_status: Record<string, number>
  aborted_by_reason: Array<{ reason: string; count: number }>
  terminal_timestamp_gaps: {
    completed_missing_timestamp: number
    failed_missing_timestamp: number
    aborted_missing_timestamp: number
  }
  recent_aborted_without_backend_session_id: Array<{
    id: string
    kombuse_session_id: string | null
    ticket_id: number | null
    backend_type: string | null
    backend_session_id: string | null
    status: string
    updated_at: string
    completed_at: string | null
    failed_at: string | null
    aborted_at: string | null
    terminal_reason: string | null
    terminal_source: string | null
  }>
}

export const sessionsApi = {
  async list(filters?: SessionFilters): Promise<PublicSession[]> {
    const params = new URLSearchParams()
    if (filters?.ticket_id) params.set('ticket_id', String(filters.ticket_id))
    if (filters?.status) params.set('status', filters.status)
    if (filters?.terminal_reason) params.set('terminal_reason', filters.terminal_reason)
    if (filters?.has_backend_session_id !== undefined) {
      params.set('has_backend_session_id', String(filters.has_backend_session_id))
    }
    if (filters?.project_id) params.set('project_id', filters.project_id)
    if (filters?.agent_id) params.set('agent_id', filters.agent_id)
    if (filters?.sort_by) params.set('sort_by', filters.sort_by)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/sessions${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<PublicSession[]>(response)
  },

  async diagnostics(recentLimit = 20): Promise<SessionDiagnostics> {
    const params = new URLSearchParams()
    params.set('recent_limit', String(recentLimit))

    const response = await fetch(`${API_BASE}/sessions/diagnostics?${params}`)
    return handleResponse<SessionDiagnostics>(response)
  },

  async get(kombuseSessionId: string): Promise<PublicSession> {
    const response = await fetch(`${API_BASE}/sessions/${kombuseSessionId}`)
    return handleResponse<PublicSession>(response)
  },

  async create(input?: { backend_type?: BackendType; agent_id?: string; model_preference?: string; project_id?: string }): Promise<PublicSession> {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    })
    return handleResponse<PublicSession>(response)
  },

  async getEvents(
    kombuseSessionId: string,
    filters?: { since_seq?: number; event_type?: string; limit?: number }
  ): Promise<{ session_id: string; events: SessionEvent[]; total: number }> {
    const params = new URLSearchParams()
    if (filters?.since_seq !== undefined) params.set('since_seq', String(filters.since_seq))
    if (filters?.event_type) params.set('event_type', filters.event_type)
    if (filters?.limit) params.set('limit', String(filters.limit))

    const url = `${API_BASE}/sessions/${kombuseSessionId}/events${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<{ session_id: string; events: SessionEvent[]; total: number }>(response)
  },

  async delete(kombuseSessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/sessions/${kombuseSessionId}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const attachmentsApi = {
  async listByComment(commentId: number): Promise<Attachment[]> {
    const response = await fetch(`${API_BASE}/comments/${commentId}/attachments`)
    return handleResponse<Attachment[]>(response)
  },

  async uploadToComment(commentId: number, file: File, uploadedById: string): Promise<Attachment> {
    const formData = new FormData()
    formData.append('uploaded_by_id', uploadedById)
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/comments/${commentId}/attachments`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse<Attachment>(response)
  },

  async listByTicket(ticketId: number): Promise<Attachment[]> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/attachments`)
    return handleResponse<Attachment[]>(response)
  },

  async uploadToTicket(ticketId: number, file: File, uploadedById: string): Promise<Attachment> {
    const formData = new FormData()
    formData.append('uploaded_by_id', uploadedById)
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/attachments`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse<Attachment>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/attachments/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  downloadUrl(id: number): string {
    return `${API_BASE}/attachments/${id}/download`
  },
}

export interface SyncState {
  pendingPermissions: PendingPermission[]
  ticketAgentStatuses: Array<{
    ticketId: number
    status: AgentActivityStatus
    sessionCount: number
  }>
  activeSessions: Array<{
    kombuseSessionId: string
    agentName: string
    ticketId?: number
    ticketTitle?: string
    effectiveBackend?: BackendType
    appliedModel?: string
    startedAt: string
  }>
}

export interface ClaudeCodeSessionEntry {
  sessionId: string
  messageCount: number
  created: string
  modified: string
  gitBranch: string
  projectPath: string
  firstPrompt?: string
  summary?: string
}

export interface ClaudeCodeValidationResult {
  valid: number
  invalid: number
  byType: Record<string, { valid: number; invalid: number }>
  errors: { index: number; type: string; issues: { path: string; message: string; code: string }[] }[]
}

export interface ClaudeCodeSessionContent {
  items: Record<string, unknown>[]
  count: number
  events: SerializedAgentEvent[]
  validation: ClaudeCodeValidationResult
}

export const claudeCodeApi = {
  async scanProjects(): Promise<ClaudeCodeProjectWithStatus[]> {
    const response = await fetch(`${API_BASE}/claude-code/projects`)
    return handleResponse<ClaudeCodeProjectWithStatus[]>(response)
  },

  async importProjects(paths: string[]): Promise<Project[]> {
    const response = await fetch(`${API_BASE}/claude-code/projects/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
    return handleResponse<Project[]>(response)
  },

  async listSessions(projectPath: string): Promise<{ sessions: ClaudeCodeSessionEntry[] }> {
    const params = new URLSearchParams({ path: projectPath })
    const response = await fetch(`${API_BASE}/claude-code/sessions?${params}`)
    return handleResponse<{ sessions: ClaudeCodeSessionEntry[] }>(response)
  },

  async getSessionContent(projectPath: string, sessionId: string): Promise<ClaudeCodeSessionContent> {
    const params = new URLSearchParams({ path: projectPath })
    const response = await fetch(`${API_BASE}/claude-code/sessions/${sessionId}?${params}`)
    return handleResponse<ClaudeCodeSessionContent>(response)
  },
}

export const profileSettingsApi = {
  async get(profileId: string, key: string): Promise<ProfileSetting> {
    const response = await fetch(
      `${API_BASE}/profiles/${profileId}/settings/${encodeURIComponent(key)}`
    )
    return handleResponse<ProfileSetting>(response)
  },

  async getAll(profileId: string): Promise<ProfileSetting[]> {
    const response = await fetch(
      `${API_BASE}/profiles/${encodeURIComponent(profileId)}/settings`
    )
    return handleResponse<ProfileSetting[]>(response)
  },

  async upsert(input: UpsertProfileSettingInput): Promise<ProfileSetting> {
    const response = await fetch(`${API_BASE}/profile-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<ProfileSetting>(response)
  },
}

export const codexApi = {
  async getMcpStatus(): Promise<CodexMcpStatus> {
    const response = await fetch(`${API_BASE}/codex/mcp`)
    return handleResponse<CodexMcpStatus>(response)
  },

  async setMcpEnabled(enabled: boolean): Promise<CodexMcpStatus> {
    const response = await fetch(`${API_BASE}/codex/mcp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    return handleResponse<CodexMcpStatus>(response)
  },
}

export const modelsApi = {
  async getModels(backendType: string): Promise<ModelCatalogResponse> {
    const params = new URLSearchParams({ backend_type: backendType })
    const response = await fetch(`${API_BASE}/models?${params}`)
    return handleResponse<ModelCatalogResponse>(response)
  },
}

export const backendStatusApi = {
  async getStatus(): Promise<BackendStatus[]> {
    const response = await fetch(`${API_BASE}/backend-status`)
    return handleResponse<BackendStatus[]>(response)
  },

  async refreshStatus(): Promise<BackendStatus[]> {
    const response = await fetch(`${API_BASE}/backend-status/refresh`, {
      method: 'POST',
    })
    return handleResponse<BackendStatus[]>(response)
  },
}

export const syncApi = {
  async getState(): Promise<SyncState> {
    const response = await fetch(`${API_BASE}/sync/state`)
    return handleResponse<SyncState>(response)
  },
}
