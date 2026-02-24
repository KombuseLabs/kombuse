export type MilestoneStatus = 'open' | 'closed'

export interface Milestone {
  id: number
  project_id: string
  title: string
  description: string | null
  due_date: string | null
  status: MilestoneStatus
  created_at: string
  updated_at: string
}

export interface MilestoneWithStats extends Milestone {
  open_count: number
  closed_count: number
  total_count: number
}

export interface CreateMilestoneInput {
  project_id: string
  title: string
  description?: string
  due_date?: string
}

export interface UpdateMilestoneInput {
  title?: string
  description?: string | null
  due_date?: string | null
  status?: MilestoneStatus
}

export interface MilestoneFilters {
  project_id?: string
  status?: MilestoneStatus
}
