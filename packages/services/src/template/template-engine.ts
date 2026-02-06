import nunjucks from 'nunjucks'
import type { TemplateContext } from '@kombuse/types'

// Configure Nunjucks environment
// - autoescape: false - prompts are not HTML, no escaping needed
// - throwOnUndefined: false - missing variables render as empty string
const env = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: false,
})

// Custom 'or' filter that handles null (unlike built-in 'default' which only catches undefined)
// Usage: {{ comment_id | or("N/A") }}
env.addFilter('or', (value: unknown, defaultValue: unknown) => {
  return value == null ? defaultValue : value
})

/**
 * Render a template string with the given context.
 *
 * @example
 * renderTemplate("Hello {{ actor.name }}", context)
 * // => "Hello Alice"
 *
 * @example
 * renderTemplate("{% if ticket.priority == 4 %}URGENT{% endif %}", context)
 * // => "URGENT" or ""
 */
export function renderTemplate(
  template: string,
  context: TemplateContext
): string {
  return env.renderString(template, context)
}

/**
 * Check if a template string contains any Nunjucks template syntax.
 * Useful for skipping rendering on plain text prompts.
 */
export function hasTemplateVariables(template: string): boolean {
  // Match {{ }}, {% %}, or {# #}
  return /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/.test(template)
}
