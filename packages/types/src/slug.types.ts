/**
 * Convert a display name to a kebab-case slug.
 * "Ticket Analyzer" -> "ticket-analyzer"
 * "Pipeline Orchestrator" -> "pipeline-orchestrator"
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Regex for valid slug format */
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** UUID v4 regex for validation */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
