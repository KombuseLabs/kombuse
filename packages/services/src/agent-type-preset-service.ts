import type { AgentConfig, PermissionMode } from '@kombuse/types'

/**
 * Agent type preset — determines auto-approved tools and system preamble for an agent class.
 */
export interface AgentTypePreset {
  /** Tools auto-approved without permission prompt */
  autoApprovedTools: string[]
  /** Bash command prefixes auto-approved (empty = none) */
  autoApprovedBashCommands: string[]
  /** Nunjucks template for the type preamble (injected via --append-system-prompt) */
  preambleTemplate: string
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

const READ_TOOLS: string[] = ['Grep', 'Glob', 'Read']

/**
 * Shared preamble section for ticket-aware agents (kombuse tools, communication model, ticket context).
 * Composed into type-specific preamble templates below.
 */
const SHARED_PREAMBLE_SECTION = `You are working on ticket #{{ ticket_number }}{% if ticket %}: "{{ ticket.title }}"{% endif %} in project {{ project_id }}.

## Tool Usage
- Use Glob (not \`find\`) for file pattern matching
- Use Grep (not \`grep\` or \`rg\`) for searching file contents
- Use Read (not \`cat\`, \`head\`, or \`tail\`) for reading files
- Use Edit/Write (not \`echo >\` or \`sed\`) for file modifications
- Reserve Bash for commands that have no dedicated tool equivalent

## Kombuse Tools
You have these MCP tools for ticket communication:
- get_ticket — read a ticket and its comments
- get_ticket_comment — read one comment by ID
- add_comment — post a comment (always include kombuse_session_id: "{{ kombuse_session_id }}")
- create_ticket — create a new ticket (always include kombuse_session_id: "{{ kombuse_session_id }}")
- update_comment — edit a previous comment
- update_ticket — update ticket fields (always include kombuse_session_id: "{{ kombuse_session_id }}")
- list_labels — list available labels for a project
- query_db — run read-only SQL for broader context (e.g. find related tickets)
- list_tables / describe_table — explore the database schema
- list_api_endpoints — discover available REST API endpoints (method + path)
- call_api — call a GET endpoint on the Kombuse API (in-process, no curl needed)
- list_agents — list agents with optional filters
- create_agent — create a new agent
- update_agent — update an existing agent's prompt, permissions, config, or enabled state

## Communication
- Tickets are the primary coordination channel. Read the ticket and all comments before acting.
- Post your results as a comment on #{{ ticket_number }} using add_comment.
- If you discover unrelated issues, use create_ticket rather than scope-creeping.
- If the ticket cross-references other tickets (#NNN), read them for context.

## Comment Quality
- Before posting, review ALL existing comments on the ticket.
- Do NOT repeat or paraphrase what another commenter has already said.
- If you agree and have nothing new to add, say so briefly (e.g. "Nothing to add beyond the above analysis") rather than restating it.
- Every comment must contribute distinct information, analysis, or perspective.
{% if ticket %}
## Ticket Context
**{{ ticket.title }}**
{% if ticket.body %}{{ ticket.body }}{% endif %}
{% if ticket.labels and ticket.labels | length > 0 %}Labels: {% for label in ticket.labels %}{{ label.name }}{% if not loop.last %}, {% endif %}{% endfor %}{% endif %}
{% if ticket.assignee %}Assignee: {{ ticket.assignee.name }}{% endif %}
{% endif %}
## Mention Syntax
- To mention an agent or user: @[Display Name](profile-id)
- CRITICAL: The @[Name](id) syntax is a system trigger — it WILL invoke that agent. 
  - NEVER use @[Name](id) syntax to refer to an agent unless you intend to trigger it and starting agents is EXPLICITLY part of your assigned workflow and task for the ticket. 
  - Instead write their name as plain text (e.g. "the Ticket Analyzer" or "Ticket Analyzer"). 
- To reference a ticket: #123 (per-project ticket number)
- The legacy @single-word format also works but only for single-word profile IDs
- IMPORTANT: Avoid #N in numbered lists or non-ticket contexts — the system parses #NNN as a ticket link. Use "item 6" or "step 6" instead of "#6".
{% if agents and agents.length > 0 %}
## Agent Directory
Available agents you can @mention:
{% for agent in agents %}- @[{{ agent.name }}]({{ agent.slug or agent.id }}){% if agent.description %} — {{ agent.description }}{% endif %}
{% endfor %}{% endif %}`

/**
 * Preamble template for 'kombuse' type agents (ticket-aware).
 * Read-only enforcement is per-agent (in role prompts), not per-type.
 */
const KOMBUSE_PREAMBLE_TEMPLATE = SHARED_PREAMBLE_SECTION

/**
 * Preamble template for 'coder' type agents (extends kombuse + write access).
 */
const CODER_PREAMBLE_TEMPLATE = `${SHARED_PREAMBLE_SECTION}
## Implementation Rules
- Read existing code before modifying. Follow existing patterns and conventions.
- Run tests after changes: \`bun run --filter <package> test\`
- Keep changes scoped to the ticket. Do not refactor unrelated code.`

const AGENT_TYPE_PRESETS: Record<string, AgentTypePreset> = {
  kombuse: {
    autoApprovedTools: [...KOMBUSE_TOOLS, ...READ_TOOLS],
    autoApprovedBashCommands: ['git status', 'git diff', 'git log', 'git show', 'git branch', 'git rev-parse'],
    preambleTemplate: KOMBUSE_PREAMBLE_TEMPLATE,
  },
  coder: {
    autoApprovedTools: [
      ...KOMBUSE_TOOLS,
      ...READ_TOOLS,
      'Edit', 'Write', 'Bash', 'Task', 'TodoWrite',
      'EnterPlanMode',
    ],
    autoApprovedBashCommands: ['bun', 'npm', 'git status', 'git diff', 'git log'],
    preambleTemplate: CODER_PREAMBLE_TEMPLATE,
    permissionMode: 'plan',
  },
  generic: {
    autoApprovedTools: [...READ_TOOLS],
    autoApprovedBashCommands: [],
    preambleTemplate: '',
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
 */
export function getTypePreset(agentType?: string): AgentTypePreset {
  if (agentType && agentType in AGENT_TYPE_PRESETS) {
    return AGENT_TYPE_PRESETS[agentType]!
  }
  return AGENT_TYPE_PRESETS[DEFAULT_AGENT_TYPE]!
}

/**
 * Resolve the effective preset for an agent, applying config overrides.
 * If config contains override arrays, they replace the base preset values.
 * Undefined overrides fall through to the base preset.
 */
export function getEffectivePreset(agentType?: string, config?: AgentConfig): AgentTypePreset {
  const base = getTypePreset(agentType)
  if (!config) return base

  const toolsOverride = config.auto_approved_tools_override
  const bashOverride = config.auto_approved_bash_commands_override

  if (toolsOverride === undefined && bashOverride === undefined) return base

  return {
    ...base,
    autoApprovedTools: toolsOverride ?? base.autoApprovedTools,
    autoApprovedBashCommands: bashOverride ?? base.autoApprovedBashCommands,
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
    const command = String(input.command).trim()
    return preset.autoApprovedBashCommands.some((cmd: string) =>
      command === cmd || command.startsWith(`${cmd} `)
    )
  }

  return false
}
