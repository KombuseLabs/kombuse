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
} from '@kombuse/types'

const API_BASE = 'http://localhost:3332/api'

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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async get(id: number): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets/${id}`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async create(input: CreateTicketInput): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async update(id: number, input: UpdateTicketInput): Promise<Ticket> {
    const response = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/tickets/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
  },
}

export const commentsApi = {
  async list(ticketId: number, filters?: CommentFilters): Promise<Comment[]> {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const url = `${API_BASE}/tickets/${ticketId}/comments${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async update(id: number, input: UpdateCommentInput): Promise<Comment> {
    const response = await fetch(`${API_BASE}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/comments/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
  },
}

export const labelsApi = {
  async listByProject(projectId: string): Promise<Label[]> {
    const response = await fetch(`${API_BASE}/projects/${projectId}/labels`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async getTicketLabels(ticketId: number): Promise<Label[]> {
    const response = await fetch(`${API_BASE}/tickets/${ticketId}/labels`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
  },

  async removeFromTicket(ticketId: number, labelId: number): Promise<void> {
    const response = await fetch(
      `${API_BASE}/tickets/${ticketId}/labels/${labelId}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async update(id: number, input: UpdateLabelInput): Promise<Label> {
    const response = await fetch(`${API_BASE}/labels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/labels/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
  },
}
