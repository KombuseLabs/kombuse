import type {
  Ticket,
  TicketWithLabels,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  CommentWithAuthor,
  CreateCommentInput,
  UpdateCommentInput,
  CommentFilters,
  Label,
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
  EventWithActor,
  EventFilters,
  Session,
  SessionFilters,
  SessionEvent,
  TicketTimeline,
  Attachment,
  PendingPermission,
  AgentActivityStatus,
} from '@kombuse/types'

const API_BASE = 'http://localhost:3331/api'

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
    if (filters?.sort_by) params.set('sort_by', filters.sort_by)
    if (filters?.sort_order) params.set('sort_order', filters.sort_order)

    const url = `${API_BASE}/tickets${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<TicketWithLabels[]>(response)
  },

  async get(id: number): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets/${id}`)
    return handleResponse<Ticket>(response)
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
}

export const commentsApi = {
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
  async listByProject(projectId: string): Promise<Label[]> {
    const response = await fetch(`${API_BASE}/projects/${projectId}/labels`)
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

export const agentsApi = {
  async list(filters?: AgentFilters): Promise<Agent[]> {
    const params = new URLSearchParams()
    if (filters?.is_enabled !== undefined)
      params.set('is_enabled', String(filters.is_enabled))
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

export const timelineApi = {
  async getTicketTimeline(ticketId: number): Promise<TicketTimeline> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/timeline`)
    return handleResponse<TicketTimeline>(response)
  },
}

export const sessionsApi = {
  async list(filters?: SessionFilters): Promise<Session[]> {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/sessions${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Session[]>(response)
  },

  async get(id: string): Promise<Session> {
    const response = await fetch(`${API_BASE}/sessions/${id}`)
    return handleResponse<Session>(response)
  },

  async create(input?: { backend_type?: string }): Promise<Session> {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    })
    return handleResponse<Session>(response)
  },

  async getEvents(
    sessionId: string,
    filters?: { since_seq?: number; event_type?: string; limit?: number }
  ): Promise<{ session_id: string; events: SessionEvent[]; total: number }> {
    const params = new URLSearchParams()
    if (filters?.since_seq !== undefined) params.set('since_seq', String(filters.since_seq))
    if (filters?.event_type) params.set('event_type', filters.event_type)
    if (filters?.limit) params.set('limit', String(filters.limit))

    const url = `${API_BASE}/sessions/${sessionId}/events${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<{ session_id: string; events: SessionEvent[]; total: number }>(response)
  },

  async getByKombuseId(kombuseSessionId: string): Promise<Session> {
    const response = await fetch(`${API_BASE}/sessions/by-kombuse/${kombuseSessionId}`)
    return handleResponse<Session>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/sessions/${id}`, {
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
}

export const syncApi = {
  async getState(): Promise<SyncState> {
    const response = await fetch(`${API_BASE}/sync/state`)
    return handleResponse<SyncState>(response)
  },
}
