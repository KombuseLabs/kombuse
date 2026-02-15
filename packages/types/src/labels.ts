/**
 * Core label entity
 */
export interface Label {
  id: number
  project_id: string
  name: string
  color: string
  description: string | null
  usage_count?: number
  created_at: string
}

export type LabelSortBy = 'name' | 'usage'
export type LabelUsageScope = 'open'

/**
 * Input for creating a label
 */
export interface CreateLabelInput {
  project_id: string
  name: string
  color?: string
  description?: string
}

/**
 * Input for updating a label
 */
export interface UpdateLabelInput {
  name?: string
  color?: string
  description?: string
}

/**
 * Filters for listing labels
 */
export interface LabelFilters {
  project_id?: string
  search?: string
  sort?: LabelSortBy
  usage_scope?: LabelUsageScope
}
