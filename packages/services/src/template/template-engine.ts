import nunjucks from 'nunjucks'
import type { TemplateContext } from '@kombuse/types'
import { pluginFilesRepository } from '@kombuse/persistence'

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
 * Nunjucks loader that resolves {% include %} paths from the plugin_files table.
 * The pluginId is set before each render call (synchronous, safe for single-threaded use).
 */
class PluginFileLoader extends nunjucks.Loader {
  private pluginId: string | null = null

  setPluginId(id: string | null) {
    this.pluginId = id
  }

  getSource(name: string): { src: string; path: string; noCache: boolean } {
    if (!this.pluginId) {
      throw new Error(`Cannot resolve include "${name}": no plugin context`)
    }
    const file = pluginFilesRepository.get(this.pluginId, name)
    if (!file) {
      throw new Error(`Plugin file not found: "${name}" in plugin ${this.pluginId}`)
    }
    return { src: file.content, path: name, noCache: true }
  }
}

const pluginFileLoader = new PluginFileLoader()
const includeEnv = new nunjucks.Environment(pluginFileLoader as nunjucks.ILoader, {
  autoescape: false,
  throwOnUndefined: false,
})

includeEnv.addFilter('or', (value: unknown, defaultValue: unknown) => {
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
 * Render a template string with {% include %} support.
 * Includes are resolved from the plugin_files table for the given plugin.
 * Falls back to the basic env if pluginId is null.
 */
export function renderTemplateWithIncludes(
  template: string,
  context: TemplateContext,
  pluginId: string | null
): string {
  if (!pluginId) {
    return env.renderString(template, context)
  }
  pluginFileLoader.setPluginId(pluginId)
  return includeEnv.renderString(template, context)
}

/**
 * Check if a template string contains any Nunjucks template syntax.
 * Useful for skipping rendering on plain text prompts.
 */
export function hasTemplateVariables(template: string): boolean {
  // Match {{ }}, {% %}, or {# #}
  return /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/.test(template)
}
