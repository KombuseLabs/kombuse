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
  ClaudeCodeMcpStatus,
  DatabaseTablesResponse,
  DatabaseQueryInput,
  DatabaseQueryResponse,
  ModelCatalogResponse,
  BackendStatus,
  AgentExportResult,
  PluginExportInput,
  PluginExportResult,
  PluginFile,
  Plugin,
  PluginInstallInput,
  PluginInstallResult,
  PluginRemoteInstallInput,
  PluginUpdateCheckResult,
  AvailablePlugin,
  InitProjectResult,
  PluginSourceConfig,
} from '@kombuse/types'

declare global {
  interface Window {
    electron?: {
      serverPort?: number
      restart?: () => Promise<void>
      selectDirectory?: () => Promise<string | null>
      platform?: string
      shellUpdate?: {
        quitAndInstall: () => Promise<void>
      }
      onCheckForUpdates?: (callback: () => void) => () => void
      findInPage?: {
        find: (text: string) => Promise<void>
        findNext: (text: string) => Promise<void>
        findPrev: (text: string) => Promise<void>
        stop: () => Promise<void>
        onToggle: (callback: () => void) => () => void
        onResult: (callback: (result: { activeMatchOrdinal: number; matches: number; finalUpdate: boolean }) => void) => () => void
      }
    }
    __kombuse?: {
      setInputValue?: (selector: string, value: string) => boolean
      activateTab?: (selector: string) => boolean
      openSelect?: (selector: string) => boolean
      toggleCheckbox?: (selector: string) => boolean
      scrollTo?: (selector: string) => boolean
      getElementRect?: (selector: string) => { x: number; y: number; width: number; height: number } | null
      redactPaths?: () => number
    }
  }
}

export function getServerPort(): number {
  const bridgePort = window.electron?.serverPort
  if (bridgePort) return bridgePort

  // Fallback: read port from URL query param (set by Electron main process).
  // This works even when the preload bridge fails completely.
  const urlPort = new URL(window.location.href).searchParams.get('port')
  if (urlPort) {
    const parsed = Number(urlPort)
    if (parsed > 0) return parsed
  }

  return 3331
}

function getServerHost(): string {
  // In Electron, the embedded server always runs on localhost.
  // window.location.hostname is unreliable under custom protocols (app://).
  if (window.electron) return 'localhost'
  return window.location.hostname || 'localhost'
}

export function getWsUrl(): string {
  return `ws://${getServerHost()}:${getServerPort()}/ws`
}

function getApiBase(): string {
  return `http://${getServerHost()}:${getServerPort()}/api`
}

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

    const url = `${getApiBase()}/tickets${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<TicketWithLabels[]>(response)
  },

  async getByNumber(projectId: string, ticketNumber: number): Promise<TicketWithRelations> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}`)
    return handleResponse<TicketWithRelations>(response)
  },

  async markViewed(projectId: string, ticketNumber: number, profileId: string): Promise<void> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    })
    await handleResponse(response)
  },

  async create(input: CreateTicketInput): Promise<Ticket> {
    const response = await fetch(`${getApiBase()}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Ticket>(response)
  },

  async update(projectId: string, ticketNumber: number, input: UpdateTicketInput): Promise<Ticket> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Ticket>(response)
  },

  async delete(projectId: string, ticketNumber: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async statusCounts(projectId: string): Promise<TicketStatusCounts> {
    const response = await fetch(`${getApiBase()}/tickets/counts?project_id=${encodeURIComponent(projectId)}`)
    return handleResponse<TicketStatusCounts>(response)
  },
}

export const commentsApi = {
  async get(id: number): Promise<CommentWithAuthor> {
    const response = await fetch(`${getApiBase()}/comments/${id}`)
    return handleResponse<CommentWithAuthor>(response)
  },

  async list(projectId: string, ticketNumber: number, filters?: CommentFilters): Promise<CommentWithAuthor[]> {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/comments${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<CommentWithAuthor[]>(response)
  },

  async create(
    projectId: string,
    ticketNumber: number,
    input: Omit<CreateCommentInput, 'ticket_id'>
  ): Promise<CommentWithAuthor> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<CommentWithAuthor>(response)
  },

  async update(id: number, input: UpdateCommentInput): Promise<CommentWithAuthor> {
    const response = await fetch(`${getApiBase()}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<CommentWithAuthor>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/comments/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const labelsApi = {
  async listByProject(projectId: string, filters?: Pick<LabelFilters, 'search' | 'sort' | 'usage_scope' | 'is_enabled'>): Promise<Label[]> {
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.sort) params.set('sort', filters.sort)
    if (filters?.usage_scope) params.set('usage_scope', filters.usage_scope)
    if (filters?.is_enabled !== undefined) params.set('is_enabled', String(filters.is_enabled))

    const url = `${getApiBase()}/projects/${projectId}/labels${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Label[]>(response)
  },

  async getTicketLabels(projectId: string, ticketNumber: number): Promise<Label[]> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/labels`)
    return handleResponse<Label[]>(response)
  },

  async addToTicket(
    projectId: string,
    ticketNumber: number,
    labelId: number,
    addedById?: string
  ): Promise<void> {
    const response = await fetch(
      `${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/labels/${labelId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added_by_id: addedById }),
      }
    )
    await handleEmptyResponse(response)
  },

  async removeFromTicket(projectId: string, ticketNumber: number, labelId: number, removedById?: string): Promise<void> {
    const response = await fetch(
      `${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/labels/${labelId}`,
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
    const response = await fetch(`${getApiBase()}/projects/${projectId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Label>(response)
  },

  async update(id: number, input: UpdateLabelInput): Promise<Label> {
    const response = await fetch(`${getApiBase()}/labels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Label>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/labels/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async getSmartLabelIds(projectId: string): Promise<number[]> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/smart-label-ids`)
    const data = await handleResponse<{ label_ids: number[] }>(response)
    return data.label_ids
  },
}

export const milestonesApi = {
  async listByProject(projectId: string): Promise<MilestoneWithStats[]> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/milestones`)
    return handleResponse<MilestoneWithStats[]>(response)
  },

  async get(id: number): Promise<MilestoneWithStats> {
    const response = await fetch(`${getApiBase()}/milestones/${id}`)
    return handleResponse<MilestoneWithStats>(response)
  },

  async create(
    projectId: string,
    input: Omit<CreateMilestoneInput, 'project_id'>
  ): Promise<Milestone> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Milestone>(response)
  },

  async update(id: number, input: UpdateMilestoneInput): Promise<Milestone> {
    const response = await fetch(`${getApiBase()}/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Milestone>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/milestones/${id}`, {
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
    if (filters?.project_id)
      params.set('project_id', filters.project_id)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${getApiBase()}/agents${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Agent[]>(response)
  },

  async get(id: string): Promise<Agent> {
    const response = await fetch(`${getApiBase()}/agents/${id}`)
    return handleResponse<Agent>(response)
  },

  async create(input: CreateAgentInput): Promise<Agent> {
    const response = await fetch(`${getApiBase()}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Agent>(response)
  },

  async update(id: string, input: UpdateAgentInput): Promise<Agent> {
    const response = await fetch(`${getApiBase()}/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Agent>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${getApiBase()}/agents/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async export(input: { directory: string; agent_ids?: string[] }): Promise<AgentExportResult> {
    const response = await fetch(`${getApiBase()}/agents/export`, {
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
    if (filters?.has_agent !== undefined)
      params.set('has_agent', String(filters.has_agent))
    if (filters?.project_id) params.set('project_id', filters.project_id)

    const url = `${getApiBase()}/profiles${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Profile[]>(response)
  },

  async get(id: string): Promise<Profile> {
    const response = await fetch(`${getApiBase()}/profiles/${id}`)
    return handleResponse<Profile>(response)
  },

  async create(input: CreateProfileInput): Promise<Profile> {
    const response = await fetch(`${getApiBase()}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Profile>(response)
  },

  async update(id: string, input: UpdateProfileInput): Promise<Profile> {
    const response = await fetch(`${getApiBase()}/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Profile>(response)
  },
}

export const triggersApi = {
  async list(agentId: string): Promise<AgentTrigger[]> {
    const response = await fetch(`${getApiBase()}/agents/${agentId}/triggers`)
    return handleResponse<AgentTrigger[]>(response)
  },

  async get(id: number): Promise<AgentTrigger> {
    const response = await fetch(`${getApiBase()}/triggers/${id}`)
    return handleResponse<AgentTrigger>(response)
  },

  async create(
    agentId: string,
    input: Omit<CreateAgentTriggerInput, 'agent_id'>
  ): Promise<AgentTrigger> {
    const response = await fetch(`${getApiBase()}/agents/${agentId}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<AgentTrigger>(response)
  },

  async update(id: number, input: UpdateAgentTriggerInput): Promise<AgentTrigger> {
    const response = await fetch(`${getApiBase()}/triggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<AgentTrigger>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/triggers/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async listByLabel(labelId: number): Promise<AgentTrigger[]> {
    const response = await fetch(`${getApiBase()}/labels/${labelId}/triggers`)
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

    const url = `${getApiBase()}/projects${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Project[]>(response)
  },

  async get(id: string): Promise<Project> {
    const response = await fetch(`${getApiBase()}/projects/${id}`)
    return handleResponse<Project>(response)
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const response = await fetch(`${getApiBase()}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Project>(response)
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const response = await fetch(`${getApiBase()}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Project>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${getApiBase()}/projects/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  async initProject(id: string): Promise<InitProjectResult> {
    const response = await fetch(`${getApiBase()}/projects/${id}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return handleResponse<InitProjectResult>(response)
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

    const url = `${getApiBase()}/events${params.toString() ? `?${params}` : ''}`
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

    const url = `${getApiBase()}/projects/${projectId}/permissions${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<PermissionLogEntry[]>(response)
  },
}

export const databaseApi = {
  async listTables(): Promise<DatabaseTablesResponse> {
    const response = await fetch(`${getApiBase()}/database/tables`)
    return handleResponse<DatabaseTablesResponse>(response)
  },

  async query(input: DatabaseQueryInput): Promise<DatabaseQueryResponse> {
    const response = await fetch(`${getApiBase()}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<DatabaseQueryResponse>(response)
  },
}

export const timelineApi = {
  async getTicketTimeline(projectId: string, ticketNumber: number): Promise<TicketTimeline> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/timeline`)
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

    const url = `${getApiBase()}/sessions${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<PublicSession[]>(response)
  },

  async diagnostics(recentLimit = 20): Promise<SessionDiagnostics> {
    const params = new URLSearchParams()
    params.set('recent_limit', String(recentLimit))

    const response = await fetch(`${getApiBase()}/sessions/diagnostics?${params}`)
    return handleResponse<SessionDiagnostics>(response)
  },

  async get(kombuseSessionId: string): Promise<PublicSession> {
    const response = await fetch(`${getApiBase()}/sessions/${kombuseSessionId}`)
    return handleResponse<PublicSession>(response)
  },

  async create(input?: { backend_type?: BackendType; agent_id?: string; model_preference?: string; project_id?: string }): Promise<PublicSession> {
    const response = await fetch(`${getApiBase()}/sessions`, {
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

    const url = `${getApiBase()}/sessions/${kombuseSessionId}/events${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<{ session_id: string; events: SessionEvent[]; total: number }>(response)
  },

  async delete(kombuseSessionId: string): Promise<void> {
    const response = await fetch(`${getApiBase()}/sessions/${kombuseSessionId}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },
}

export const attachmentsApi = {
  async listByComment(commentId: number): Promise<Attachment[]> {
    const response = await fetch(`${getApiBase()}/comments/${commentId}/attachments`)
    return handleResponse<Attachment[]>(response)
  },

  async uploadToComment(commentId: number, file: File, uploadedById: string): Promise<Attachment> {
    const formData = new FormData()
    formData.append('uploaded_by_id', uploadedById)
    formData.append('file', file)
    const response = await fetch(`${getApiBase()}/comments/${commentId}/attachments`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse<Attachment>(response)
  },

  async listByTicket(projectId: string, ticketNumber: number): Promise<Attachment[]> {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/attachments`)
    return handleResponse<Attachment[]>(response)
  },

  async uploadToTicket(projectId: string, ticketNumber: number, file: File, uploadedById: string): Promise<Attachment> {
    const formData = new FormData()
    formData.append('uploaded_by_id', uploadedById)
    formData.append('file', file)
    const response = await fetch(`${getApiBase()}/projects/${projectId}/tickets/by-number/${ticketNumber}/attachments`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse<Attachment>(response)
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${getApiBase()}/attachments/${id}`, {
      method: 'DELETE',
    })
    await handleEmptyResponse(response)
  },

  downloadUrl(id: number): string {
    return `${getApiBase()}/attachments/${id}/download`
  },
}

export interface SyncState {
  pendingPermissions: PendingPermission[]
  ticketAgentStatuses: Array<{
    ticketNumber: number
    projectId: string
    status: AgentActivityStatus
    sessionCount: number
  }>
  activeSessions: Array<{
    kombuseSessionId: string
    agentName: string
    ticketNumber?: number
    ticketTitle?: string
    projectId?: string
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
    const response = await fetch(`${getApiBase()}/claude-code/projects`)
    return handleResponse<ClaudeCodeProjectWithStatus[]>(response)
  },

  async importProjects(paths: string[]): Promise<Project[]> {
    const response = await fetch(`${getApiBase()}/claude-code/projects/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
    return handleResponse<Project[]>(response)
  },

  async listSessions(projectPath: string): Promise<{ sessions: ClaudeCodeSessionEntry[] }> {
    const params = new URLSearchParams({ path: projectPath })
    const response = await fetch(`${getApiBase()}/claude-code/sessions?${params}`)
    return handleResponse<{ sessions: ClaudeCodeSessionEntry[] }>(response)
  },

  async getSessionContent(projectPath: string, sessionId: string): Promise<ClaudeCodeSessionContent> {
    const params = new URLSearchParams({ path: projectPath })
    const response = await fetch(`${getApiBase()}/claude-code/sessions/${sessionId}?${params}`)
    return handleResponse<ClaudeCodeSessionContent>(response)
  },
}

export const profileSettingsApi = {
  async get(profileId: string, key: string): Promise<ProfileSetting | null> {
    const response = await fetch(
      `${getApiBase()}/profiles/${profileId}/settings/${encodeURIComponent(key)}`
    )
    return handleResponse<ProfileSetting | null>(response)
  },

  async getAll(profileId: string): Promise<ProfileSetting[]> {
    const response = await fetch(
      `${getApiBase()}/profiles/${encodeURIComponent(profileId)}/settings`
    )
    return handleResponse<ProfileSetting[]>(response)
  },

  async upsert(input: UpsertProfileSettingInput): Promise<ProfileSetting> {
    const response = await fetch(`${getApiBase()}/profile-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<ProfileSetting>(response)
  },
}

export const codexApi = {
  async getMcpStatus(): Promise<CodexMcpStatus> {
    const response = await fetch(`${getApiBase()}/codex/mcp`)
    return handleResponse<CodexMcpStatus>(response)
  },

  async setMcpEnabled(enabled: boolean): Promise<CodexMcpStatus> {
    const response = await fetch(`${getApiBase()}/codex/mcp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    return handleResponse<CodexMcpStatus>(response)
  },
}

export const claudeCodeMcpApi = {
  async getMcpStatus(): Promise<ClaudeCodeMcpStatus> {
    const response = await fetch(`${getApiBase()}/claude-code/mcp`)
    return handleResponse<ClaudeCodeMcpStatus>(response)
  },

  async setMcpEnabled(enabled: boolean): Promise<ClaudeCodeMcpStatus> {
    const response = await fetch(`${getApiBase()}/claude-code/mcp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    return handleResponse<ClaudeCodeMcpStatus>(response)
  },
}

export const modelsApi = {
  async getModels(backendType: string): Promise<ModelCatalogResponse> {
    const params = new URLSearchParams({ backend_type: backendType })
    const response = await fetch(`${getApiBase()}/models?${params}`)
    return handleResponse<ModelCatalogResponse>(response)
  },
}

export const backendStatusApi = {
  async getStatus(): Promise<BackendStatus[]> {
    const response = await fetch(`${getApiBase()}/backend-status`)
    return handleResponse<BackendStatus[]>(response)
  },

  async refreshStatus(): Promise<BackendStatus[]> {
    const response = await fetch(`${getApiBase()}/backend-status/refresh`, {
      method: 'POST',
    })
    return handleResponse<BackendStatus[]>(response)
  },
}

export const pluginsApi = {
  async exportPlugin(input: PluginExportInput): Promise<PluginExportResult> {
    const response = await fetch(`${getApiBase()}/plugins/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<PluginExportResult>(response)
  },

  async list(projectId: string): Promise<Plugin[]> {
    const params = new URLSearchParams({ project_id: projectId })
    const response = await fetch(`${getApiBase()}/plugins?${params}`)
    return handleResponse<Plugin[]>(response)
  },

  async get(id: string): Promise<Plugin> {
    const response = await fetch(`${getApiBase()}/plugins/${id}`)
    return handleResponse<Plugin>(response)
  },

  async available(projectId: string): Promise<AvailablePlugin[]> {
    const params = new URLSearchParams({ project_id: projectId })
    const response = await fetch(`${getApiBase()}/plugins/available?${params}`)
    return handleResponse<AvailablePlugin[]>(response)
  },

  async install(input: PluginInstallInput): Promise<PluginInstallResult> {
    const response = await fetch(`${getApiBase()}/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<PluginInstallResult>(response)
  },

  async update(id: string, input: { is_enabled?: boolean }): Promise<Plugin> {
    const response = await fetch(`${getApiBase()}/plugins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Plugin>(response)
  },

  async uninstall(id: string, mode: 'orphan' | 'delete' = 'orphan'): Promise<void> {
    const params = new URLSearchParams({ mode })
    const response = await fetch(`${getApiBase()}/plugins/${id}?${params}`, {
      method: 'DELETE',
    })
    return handleEmptyResponse(response)
  },

  async checkUpdates(pluginId: string): Promise<PluginUpdateCheckResult> {
    const response = await fetch(`${getApiBase()}/plugins/${pluginId}/check-updates`)
    return handleResponse<PluginUpdateCheckResult>(response)
  },

  async installRemote(input: PluginRemoteInstallInput): Promise<PluginInstallResult> {
    const response = await fetch(`${getApiBase()}/plugins/install-remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<PluginInstallResult>(response)
  },

  async pull(pluginId: string): Promise<PluginInstallResult> {
    const response = await fetch(`${getApiBase()}/plugins/${pluginId}/pull`, {
      method: 'POST',
    })
    return handleResponse<PluginInstallResult>(response)
  },
}

export const pluginFilesApi = {
  async list(pluginId: string): Promise<PluginFile[]> {
    const response = await fetch(`${getApiBase()}/plugins/${pluginId}/files`)
    return handleResponse<PluginFile[]>(response)
  },

  async get(pluginId: string, fileId: number): Promise<PluginFile> {
    const response = await fetch(`${getApiBase()}/plugins/${pluginId}/files/${fileId}`)
    return handleResponse<PluginFile>(response)
  },

  async update(pluginId: string, fileId: number, input: { content: string }): Promise<PluginFile> {
    const response = await fetch(`${getApiBase()}/plugins/${pluginId}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<PluginFile>(response)
  },
}

export interface DefaultSource {
  type: string
  path?: string
  base_url?: string
  label: string
}

export interface PluginSourcesResponse {
  global_sources: PluginSourceConfig[]
  project_sources: PluginSourceConfig[]
  default_sources: DefaultSource[]
}

export const pluginSourcesApi = {
  async get(projectId: string): Promise<PluginSourcesResponse> {
    const params = new URLSearchParams({ project_id: projectId })
    const response = await fetch(`${getApiBase()}/plugin-sources?${params}`)
    return handleResponse<PluginSourcesResponse>(response)
  },

  async update(
    projectId: string,
    sources: PluginSourceConfig[]
  ): Promise<PluginSourcesResponse> {
    const response = await fetch(`${getApiBase()}/plugin-sources`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, sources }),
    })
    return handleResponse<PluginSourcesResponse>(response)
  },
}

export type SessionsPerDayEntry = { date: string; count: number }

export type SessionDurationPercentileEntry = {
  agent_id: string | null
  agent_name: string | null
  p50: number
  p90: number
  p99: number
  avg: number
  count: number
}

export type PipelineStageDurationEntry = {
  agent_id: string
  agent_name: string
  avg_duration: number
  p50: number
  p90: number
  count: number
}

export type ToolReadFrequencyEntry = {
  file_path: string
  read_count: number
}

export type ToolCallsPerSessionEntry = {
  session_id: string
  agent_id: string | null
  agent_name: string
  call_count: number
}

export type ToolDurationPercentileEntry = {
  tool_name: string
  count: number
  avg: number
  p50: number
  p90: number
  p99: number
}

export type ToolCallVolumeEntry = {
  tool_name: string
  call_count: number
  session_count: number
}

export type BurndownEntry = {
  date: string
  total: number
  open: number
  closed: number
  ideal: number | null
}

export type AgentRuntimeSegmentEntry = {
  ticket_number: number
  ticket_title: string
  agent_name: string
  agent_id: string | null
  session_id: string
  duration_ms: number
  run_index: number
}

export const analyticsApi = {
  async sessionsPerDay(projectId: string, days?: number): Promise<SessionsPerDayEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))

    const response = await fetch(`${getApiBase()}/analytics/sessions-per-day?${params}`)
    return handleResponse<SessionsPerDayEntry[]>(response)
  },

  async durationPercentiles(
    projectId: string,
    days?: number
  ): Promise<SessionDurationPercentileEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))

    const response = await fetch(`${getApiBase()}/analytics/duration-percentiles?${params}`)
    return handleResponse<SessionDurationPercentileEntry[]>(response)
  },

  async pipelineStageDuration(
    projectId: string,
    days?: number
  ): Promise<PipelineStageDurationEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))

    const response = await fetch(`${getApiBase()}/analytics/pipeline-stage-duration?${params}`)
    return handleResponse<PipelineStageDurationEntry[]>(response)
  },

  async mostFrequentReads(
    projectId: string,
    days?: number,
    limit?: number
  ): Promise<ToolReadFrequencyEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))
    if (limit !== undefined) params.set('limit', String(limit))

    const response = await fetch(`${getApiBase()}/analytics/most-frequent-reads?${params}`)
    return handleResponse<ToolReadFrequencyEntry[]>(response)
  },

  async toolCallsPerSession(
    projectId: string,
    days?: number,
    agentId?: string
  ): Promise<ToolCallsPerSessionEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))
    if (agentId !== undefined) params.set('agent_id', agentId)

    const response = await fetch(`${getApiBase()}/analytics/tool-calls-per-session?${params}`)
    return handleResponse<ToolCallsPerSessionEntry[]>(response)
  },

  async slowestTools(projectId: string, days?: number): Promise<ToolDurationPercentileEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))

    const response = await fetch(`${getApiBase()}/analytics/slowest-tools?${params}`)
    return handleResponse<ToolDurationPercentileEntry[]>(response)
  },

  async toolCallVolume(projectId: string, days?: number): Promise<ToolCallVolumeEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))

    const response = await fetch(`${getApiBase()}/analytics/tool-call-volume?${params}`)
    return handleResponse<ToolCallVolumeEntry[]>(response)
  },

  async ticketBurndown(
    projectId: string,
    days?: number,
    milestoneId?: number,
    labelId?: number,
  ): Promise<BurndownEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (days !== undefined) params.set('days', String(days))
    if (milestoneId !== undefined) params.set('milestone_id', String(milestoneId))
    if (labelId !== undefined) params.set('label_id', String(labelId))

    const response = await fetch(`${getApiBase()}/analytics/ticket-burndown?${params}`)
    return handleResponse<BurndownEntry[]>(response)
  },

  async agentRuntimePerTicket(
    projectId: string,
    limit?: number,
  ): Promise<AgentRuntimeSegmentEntry[]> {
    const params = new URLSearchParams()
    params.set('project_id', projectId)
    if (limit !== undefined) params.set('limit', String(limit))

    const response = await fetch(`${getApiBase()}/analytics/agent-runtime-per-ticket?${params}`)
    return handleResponse<AgentRuntimeSegmentEntry[]>(response)
  },
}

export const syncApi = {
  async getState(): Promise<SyncState> {
    const response = await fetch(`${getApiBase()}/sync/state`)
    return handleResponse<SyncState>(response)
  },
}
