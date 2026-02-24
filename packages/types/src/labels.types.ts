/**
 * Core label entity
 */
export interface Label {
  id: number
  project_id: string
  name: string
  slug: string | null
  color: string
  description: string | null
  plugin_id: string | null
  is_enabled: boolean
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
  slug?: string
  color?: string
  description?: string
  plugin_id?: string | null
}

/**
 * Input for updating a label
 */
export interface UpdateLabelInput {
  name?: string
  slug?: string
  color?: string
  description?: string
  plugin_id?: string | null
  is_enabled?: boolean
}

/**
 * Filters for listing labels
 */
export interface LabelFilters {
  project_id?: string
  search?: string
  sort?: LabelSortBy
  usage_scope?: LabelUsageScope
  is_enabled?: boolean
}
