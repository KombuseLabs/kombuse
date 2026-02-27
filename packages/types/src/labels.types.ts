import type { z } from 'zod'
import type { labelSchema } from './schemas/entities'

// Derived from Zod schemas (single source of truth)
export type Label = z.infer<typeof labelSchema>

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
