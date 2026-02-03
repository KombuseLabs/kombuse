/**
 * Core label entity
 */
export interface Label {
  id: number
  project_id: string
  name: string
  color: string
  description: string | null
  created_at: string
}

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
}
