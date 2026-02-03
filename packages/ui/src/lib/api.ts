import type {
  Ticket,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  Comment,
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
  Profile,
  ProfileFilters,
  CreateProfileInput,
  UpdateProfileInput,
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
  async list(filters?: TicketFilters): Promise<Ticket[]> {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.priority !== undefined)
      params.set('priority', String(filters.priority))
    if (filters?.project_id) params.set('project_id', filters.project_id)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/tickets${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Ticket[]>(response)
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
  async list(ticketId: number, filters?: CommentFilters): Promise<Comment[]> {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/tickets/${ticketId}/comments${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    return handleResponse<Comment[]>(response)
  },

  async create(
    ticketId: number,
    input: Omit<CreateCommentInput, 'ticket_id'>
  ): Promise<Comment> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Comment>(response)
  },

  async update(id: number, input: UpdateCommentInput): Promise<Comment> {
    const response = await fetch(`${API_BASE}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse<Comment>(response)
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

  async removeFromTicket(ticketId: number, labelId: number): Promise<void> {
    const response = await fetch(
      `${API_BASE}/tickets/${ticketId}/labels/${labelId}`,
      {
        method: 'DELETE',
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
