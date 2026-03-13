import type { AgentConfig, PermissionMode } from '@kombuse/types'
import { pluginFilesRepository } from '@kombuse/persistence'

/**
 * Agent type preset — determines auto-approved tools and system preamble for an agent class.
 */
export interface AgentTypePreset {
  /** Tools auto-approved without permission prompt */
  autoApprovedTools: string[]
  /** Bash command prefixes auto-approved (empty = none) */
  autoApprovedBashCommands: string[]
  /** Permission mode for the CLI session (e.g. 'plan' forces plan-first workflow) */
  permissionMode?: PermissionMode
}

const KOMBUSE_TOOLS: string[] = [
  'mcp__kombuse__get_ticket',
  'mcp__kombuse__get_ticket_comment',
  'mcp__kombuse__add_comment',
  'mcp__kombuse__create_ticket',
  'mcp__kombuse__update_comment',
  'mcp__kombuse__update_ticket',
  'mcp__kombuse__list_tickets',
  'mcp__kombuse__search_tickets',
  'mcp__kombuse__list_projects',
  'mcp__kombuse__list_labels',
  'mcp__kombuse__query_db',
  'mcp__kombuse__list_tables',
  'mcp__kombuse__describe_table',
  'mcp__kombuse__list_api_endpoints',
  'mcp__kombuse__call_api',
  'mcp__kombuse__list_agents',
  'mcp__kombuse__create_agent',
  'mcp__kombuse__update_agent',
]

const DESKTOP_TOOLS: string[] = [
  'mcp__kombuse__list_windows',
  'mcp__kombuse__open_window',
  'mcp__kombuse__navigate_to',
  'mcp__kombuse__execute_js',
  'mcp__kombuse__wait_for',
  'mcp__kombuse__take_screenshot',
  'mcp__kombuse__save_screenshot',
  'mcp__kombuse__close_window',
]

const READ_TOOLS: string[] = ['Grep', 'Glob', 'Read']

const AGENT_TYPE_PRESETS: Record<string, AgentTypePreset> = {
  kombuse: {
    autoApprovedTools: [...KOMBUSE_TOOLS, ...DESKTOP_TOOLS, ...READ_TOOLS, 'mcp__Astro-docs__search_astro_docs'],
    autoApprovedBashCommands: ['git status', 'git diff', 'git log', 'git show', 'git branch', 'git rev-parse', 'ls', 'cat', 'find', 'grep', 'head', 'tail', 'wc'],
  },
  coder: {
    autoApprovedTools: [
      ...KOMBUSE_TOOLS,
      ...READ_TOOLS,
      'Edit', 'Write', 'Bash', 'Task', 'TodoWrite',
      'EnterPlanMode',
    ],
    autoApprovedBashCommands: ['bun', 'npm', 'git status', 'git diff', 'git log'],
    permissionMode: 'plan',
  },
  generic: {
    autoApprovedTools: [...READ_TOOLS],
    autoApprovedBashCommands: [],
  },
}

/** Default preset when agent has no type configured */
const DEFAULT_AGENT_TYPE = 'kombuse'

/**
 * Return the list of all registered agent type keys.
 */
export function getAvailableAgentTypes(): string[] {
  return Object.keys(AGENT_TYPE_PRESETS)
}

/**
 * Resolve the type preset for an agent. Falls back to 'kombuse' if type is unknown.
 * When pluginId is provided, attempts to load from plugin files first.
 */
export function getTypePreset(agentType?: string, pluginId?: string): AgentTypePreset {
  const resolvedType = agentType ?? DEFAULT_AGENT_TYPE

  if (pluginId) {
    try {
      const file = pluginFilesRepository.get(pluginId, `presets/${resolvedType}.json`)
      if (file) {
        return JSON.parse(file.content) as AgentTypePreset
      }
    } catch {
      // Parse error — fall through to hardcoded map
    }
  }

  if (resolvedType in AGENT_TYPE_PRESETS) {
    return AGENT_TYPE_PRESETS[resolvedType]!
  }
  return AGENT_TYPE_PRESETS[DEFAULT_AGENT_TYPE]!
}

/**
 * Resolve the effective preset for an agent, applying config overrides.
 * Override arrays are additive — they are merged (union) with the base preset,
 * not replacements. Undefined overrides fall through to the base preset.
 */
export function getEffectivePreset(agentType?: string, config?: AgentConfig, pluginId?: string): AgentTypePreset {
  const base = getTypePreset(agentType, pluginId)
  if (!config) return base

  const toolsOverride = config.auto_approved_tools_override
  const bashOverride = config.auto_approved_bash_commands_override
  const clearBaseBash = config.clear_base_bash_commands === true

  if (toolsOverride === undefined && bashOverride === undefined && !clearBaseBash) return base

  const baseBash = clearBaseBash ? [] : base.autoApprovedBashCommands

  return {
    ...base,
    autoApprovedTools: toolsOverride
      ? [...new Set([...base.autoApprovedTools, ...toolsOverride])]
      : base.autoApprovedTools,
    autoApprovedBashCommands: bashOverride
      ? [...new Set([...baseBash, ...bashOverride])]
      : baseBash,
  }
}

/**
 * Convert an AgentTypePreset into CLI-compatible --allowedTools strings.
 *
 * - Tools in autoApprovedTools pass through as-is (e.g., 'Read', 'mcp__kombuse__get_ticket')
 * - If 'Bash' is NOT in autoApprovedTools but autoApprovedBashCommands has entries,
 *   each command prefix is converted to 'Bash(prefix *)' pattern
 */
export function presetToAllowedTools(preset: AgentTypePreset): string[] {
  const tools: string[] = [...preset.autoApprovedTools]

  if (!preset.autoApprovedTools.includes('Bash') && preset.autoApprovedBashCommands.length > 0) {
    for (const cmd of preset.autoApprovedBashCommands) {
      tools.push(`Bash(${cmd} *)`)
    }
  }

  return tools
}

/**
 * Strip leading `cd <path> &&` or `cd <path> ;` prefixes from a bash command.
 * Returns the actual command to evaluate for permissions.
 * Handles quoted paths and multiple chained cd prefixes.
 */
export function stripCdPrefix(command: string): string {
  let result = command.trim()
  while (true) {
    const match = result.match(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/)
    if (!match) break
    result = result.slice(match[0].length)
  }
  return result
}

/**
 * Check if a tool should be auto-approved based on the agent's type preset.
 */
export function shouldAutoApprove(
  toolName: string,
  input: Record<string, unknown> | undefined,
  preset: AgentTypePreset
): boolean {
  if (preset.autoApprovedTools.includes(toolName)) {
    return true
  }

  // Special handling for Bash - only approve specific command prefixes
  if (toolName === 'Bash' && input?.command) {
    const command = stripCdPrefix(String(input.command))
    return preset.autoApprovedBashCommands.some((cmd: string) =>
      command === cmd || command.startsWith(`${cmd} `)
    )
  }

  return false
}
