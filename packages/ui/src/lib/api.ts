import type {
  Ticket,
  TicketWithActivities,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
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

  async get(id: number): Promise<TicketWithActivities> {
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
