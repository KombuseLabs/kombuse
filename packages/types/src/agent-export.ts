import type { Permission } from './agents'

/**
 * Placeholder used in trigger conditions for self-referential values.
 * When a trigger condition value matches the agent's own ID, it is
 * replaced with this placeholder on export.
 */
export const SELF_PLACEHOLDER = '$SELF'

/**
 * Frontmatter data for an exported agent markdown file.
 * Combines profile, agent, and trigger data into a single structure.
 */
export interface AgentExportFrontmatter {
  name: string
  slug: string | null
  description: string | null
  avatar: string | null
  type: string
  model: string | null
  backend_type: string | null
  is_enabled: boolean
  enabled_for_chat: boolean
  permissions: Permission[]
  triggers: ExportedTrigger[]
  config?: Record<string, unknown>
}

/**
 * Trigger as represented in export frontmatter.
 * Strips database-internal fields (id, agent_id, created_at, updated_at).
 */
export interface ExportedTrigger {
  slug?: string
  event_type: string
  conditions: Record<string, unknown> | null
  project_id: string | null
  is_enabled: boolean
  priority: number
}

/**
 * A single exported agent file ready to be written to disk.
 */
export interface AgentExportFile {
  filename: string
  content: string
}

/**
 * Summary of an export operation.
 */
export interface AgentExportResult {
  directory: string
  count: number
  files: string[]
}

export interface AgentExportInput {
  directory: string
  agent_ids?: string[]
}
