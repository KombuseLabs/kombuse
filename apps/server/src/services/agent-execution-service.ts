import { statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { ClaudeCodeBackend } from '@kombuse/agent'
import { createSessionLogger } from '../logger'

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
  'mcp__kombuse__add_comment',
  'mcp__kombuse__create_ticket',
  'mcp__kombuse__update_comment',
  'mcp__kombuse__update_ticket',
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
const SHARED_PREAMBLE_SECTION = `You are working on ticket #{{ ticket_id }}{% if ticket %}: "{{ ticket.title }}"{% endif %}.

## Tool Usage
- Use Glob (not \`find\`) for file pattern matching
- Use Grep (not \`grep\` or \`rg\`) for searching file contents
- Use Read (not \`cat\`, \`head\`, or \`tail\`) for reading files
- Use Edit/Write (not \`echo >\` or \`sed\`) for file modifications
- Reserve Bash for commands that have no dedicated tool equivalent

## Kombuse Tools
You have these MCP tools for ticket communication:
- get_ticket — read a ticket and its comments
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
- Post your results as a comment on #{{ ticket_id }} using add_comment.
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
- To reference a ticket: #123
- The legacy @single-word format also works but only for single-word profile IDs
{% if agents and agents.length > 0 %}
## Agent Directory
Available agents you can @mention:
{% for agent in agents %}- @[{{ agent.name }}]({{ agent.id }})
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
 * Resolve the type preset for an agent. Falls back to 'kombuse' if type is unknown.
 */
export function getTypePreset(agentType?: string): AgentTypePreset {
  if (agentType && agentType in AGENT_TYPE_PRESETS) {
    return AGENT_TYPE_PRESETS[agentType]!
  }
  return AGENT_TYPE_PRESETS[DEFAULT_AGENT_TYPE]!
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
import {
  agentService,
  projectService,
  sessionPersistenceService,
  renderTemplate,
  buildTemplateContext,
  buildConversationSummary,
  type ISessionPersistenceService,
} from '@kombuse/services'
import { agentInvocationsRepository, commentsRepository, eventsRepository, profilesRepository, sessionsRepository } from '@kombuse/persistence'
import { EVENT_TYPES, createSessionId, isValidSessionId, type PermissionMode, type ServerMessage } from '@kombuse/types'
import { wsHub } from '../websocket/hub'
import { serializeAgentStreamEvent } from '../websocket/serialize-agent-event'
import type {
  ActiveSessionInfo,
  AgentBackend,
  AgentActivityStatus,
  AgentEvent,
  ClientMessage,
  ConversationContext,
  EventWithActor,
  KombuseSessionId,
} from '@kombuse/types'

type AgentInvokeMessage = Extract<ClientMessage, { type: 'agent.invoke' }>
type PermissionResponseMessage = Extract<ClientMessage, { type: 'permission.response' }>

/**
 * Options for running an agent chat session
 */
interface ChatRunnerOptions {
  /** Project path for the agent to work in */
  projectPath: string
  /** Backend-native session ID to resume */
  resumeSessionId?: string
  /** System prompt override */
  systemPrompt?: string
  /** Tools to pre-approve at the subprocess level via --allowedTools */
  allowedTools?: string[]
  /** Permission mode for the CLI session (e.g. 'plan' forces plan-first workflow) */
  permissionMode?: PermissionMode
  /** Callback for each agent event */
  onEvent: (event: AgentEvent) => void
  /** Callback when complete, receives backend session context if available */
  onComplete?: (context: ConversationContext) => void
  /** Callback on error */
  onError?: (error: Error) => void
  /** Callback when resume fails (e.g. "session does not exist") — allows retry without --resume */
  onResumeFailed?: () => void
}

/**
 * Run a chat message through an agent backend.
 * Returns immediately after starting - events come via callbacks.
 */
async function runAgentChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: KombuseSessionId,
  options: ChatRunnerOptions
): Promise<ConversationContext> {
  const appSessionId = kombuseSessionId
  let didComplete = false

  const finalize = (keepAlive = false) => {
    unsubscribe()
    if (!keepAlive && backend.isRunning()) {
      void backend.stop().catch((stopError) => {
        options.onError?.(
          stopError instanceof Error ? stopError : new Error(String(stopError))
        )
      })
    }
  }

  // Subscribe to events
  const unsubscribe = backend.subscribe((evt) => {
    if (didComplete) {
      return
    }

    if (evt.type === 'complete') {
      didComplete = true
      if (evt.resumeFailed && options.onResumeFailed) {
        finalize()
        options.onResumeFailed()
        return
      }
      if (evt.success === false) {
        const msg = evt.errorMessage
          ?? (evt.exitCode != null
            ? `Process exited with code ${evt.exitCode}`
            : `Agent run failed (${evt.reason})`)
        options.onError?.(new Error(msg))
        finalize()
      } else {
        const backendSessionId = backend.getBackendSessionId()
        const context: ConversationContext = {
          kombuseSessionId: appSessionId,
          backendSessionId,
        }
        options.onComplete?.(context)
        finalize(true) // Keep backend alive for persistent reuse
      }
    } else if (evt.type === 'error') {
      options.onEvent(evt)

      // Some backends may terminate with an error but without emitting complete.
      // Route to onError (not onComplete) so the session is marked "failed".
      if (!backend.isRunning()) {
        didComplete = true
        options.onError?.(new Error(evt.message ?? 'Backend terminated with error'))
        finalize()
      }
    } else {
      options.onEvent(evt)
    }
  })

  // Start the backend
  await backend.start({
    kombuseSessionId: appSessionId,
    resumeSessionId: options.resumeSessionId,
    projectPath: options.projectPath,
    systemPrompt: options.systemPrompt,
    allowedTools: options.allowedTools,
    permissionMode: options.permissionMode,
    initialMessage: message,
  })

  return {
    kombuseSessionId: appSessionId,
    backendSessionId: backend.getBackendSessionId(),
  }
}

/**
 * Send a follow-up message to a persistent backend.
 * Subscribes to events for this turn's lifecycle, then unsubscribes on completion.
 * The backend is NOT stopped on success — it remains alive for future messages.
 */
function runFollowUpChat(
  backend: AgentBackend,
  message: string,
  kombuseSessionId: KombuseSessionId,
  options: Omit<ChatRunnerOptions, 'resumeSessionId'>
): void {
  let didComplete = false

  const unsubscribe = backend.subscribe((evt) => {
    if (didComplete) return

    if (evt.type === 'complete') {
      didComplete = true
      unsubscribe()
      if (evt.success === false) {
        const msg = evt.errorMessage
          ?? (evt.exitCode != null
            ? `Process exited with code ${evt.exitCode}`
            : `Agent run failed (${evt.reason})`)
        options.onError?.(new Error(msg))
      } else {
        const backendSessionId = backend.getBackendSessionId()
        options.onComplete?.({
          kombuseSessionId,
          backendSessionId,
        })
      }
    } else if (evt.type === 'error') {
      options.onEvent(evt)
      if (!backend.isRunning()) {
        didComplete = true
        unsubscribe()
        options.onError?.(new Error(evt.message ?? 'Backend terminated with error'))
      }
    } else {
      options.onEvent(evt)
    }
  })

  backend.send(message)
}

/**
 * Registry of active session backends for permission response routing.
 * Backends are kept alive after successful completion for persistent reuse.
 */
const activeBackends = new Map<string, AgentBackend>()

/** Idle timeout handles for persistent backends. */
const backendIdleTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/** Default idle timeout: 5 minutes. */
const BACKEND_IDLE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Reset the idle timeout for a persistent backend.
 * Called on successful completion and on each follow-up message.
 */
function resetBackendIdleTimeout(sessionId: string): void {
  clearBackendIdleTimeout(sessionId)
  const timer = setTimeout(() => {
    const backend = activeBackends.get(sessionId)
    if (backend?.isRunning()) {
      void backend.stop()
    }
    unregisterBackend(sessionId)
    backendIdleTimeouts.delete(sessionId)
  }, BACKEND_IDLE_TIMEOUT_MS)
  if (timer.unref) timer.unref()
  backendIdleTimeouts.set(sessionId, timer)
}

function clearBackendIdleTimeout(sessionId: string): void {
  const existing = backendIdleTimeouts.get(sessionId)
  if (existing) {
    clearTimeout(existing)
    backendIdleTimeouts.delete(sessionId)
  }
}

/**
 * Server-side tracking of pending (unresolved) permission requests.
 * Keyed by requestId. Populated when a permission is broadcast to clients,
 * removed when resolved or when the backend is unregistered.
 */
interface ServerPendingPermission {
  sessionId: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description: string
  ticketId?: number
}
const serverPendingPermissions = new Map<string, ServerPendingPermission>()

export function getPendingPermissions(): ServerPendingPermission[] {
  return [...serverPendingPermissions.values()]
}

/**
 * Register a backend for permission response routing.
 */
function registerBackend(sessionId: string, backend: AgentBackend): void {
  activeBackends.set(sessionId, backend)
}

/**
 * Unregister a backend.
 */
function unregisterBackend(sessionId: string): void {
  activeBackends.delete(sessionId)
  clearBackendIdleTimeout(sessionId)
  // Clear any pending permissions for this session since the backend is gone
  for (const [requestId, perm] of serverPendingPermissions) {
    if (perm.sessionId === sessionId) {
      serverPendingPermissions.delete(requestId)
    }
  }
}

/**
 * Stop a single agent session by its kombuse session ID.
 * Returns true if the backend was found and stopped, false otherwise.
 */
export function stopAgentSession(kombuseSessionId: string): boolean {
  const backend = activeBackends.get(kombuseSessionId)
  if (!backend || !backend.isRunning()) {
    return false
  }
  void backend.stop()
  return true
}

/**
 * Stop all active backends (for graceful server shutdown).
 */
export function stopAllActiveBackends(): void {
  for (const [sessionId, backend] of activeBackends) {
    if (backend.isRunning()) {
      void backend.stop()
    }
    clearBackendIdleTimeout(sessionId)
  }
  activeBackends.clear()
  backendIdleTimeouts.clear()
}

/**
 * Broadcast a permission request to all clients.
 */
function broadcastPermissionPending(
  sessionId: string,
  event: Extract<AgentEvent, { type: 'permission_request' }>,
  ticketId?: number
): void {
  const description = generatePermissionDescription(event.toolName, event.input)
  console.log('[server] permission_request:', event.requestId, event.toolName, '-', description)
  serverPendingPermissions.set(event.requestId, {
    sessionId,
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
    description,
    ticketId,
  })
  const msg: ServerMessage = {
    type: 'agent.permission_pending',
    sessionId,
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
    description,
    ticketId,
  }
  wsHub.broadcastToTopic('*', msg)
  wsHub.broadcastToTopic(`session:${sessionId}`, msg)
}

/**
 * Compute aggregated agent status for a ticket.
 * Queries all sessions for the ticket and aggregates their status.
 * Only considers failures more recent than the last completed session
 * to avoid permanent error indicators from old historical failures.
 */
export function computeTicketAgentStatus(ticketId: number): {
  status: AgentActivityStatus
  sessionCount: number
} {
  const activeSessions = sessionsRepository.listByTicket(ticketId, { status: 'running' })
  const failedSessions = sessionsRepository.listByTicket(ticketId, { status: 'failed' })

  // Only count failures that are more recent than the last completed session
  const completedSessions = sessionsRepository.listByTicket(ticketId, { status: 'completed', limit: 1 })
  const lastCompletedAt = completedSessions[0]?.completed_at

  const recentFailures = lastCompletedAt
    ? failedSessions.filter((s) => s.completed_at && s.completed_at > lastCompletedAt)
    : failedSessions

  // Cross-reference against in-memory activeBackends map.
  // A 'running' session with no live backend is orphaned.
  const trulyActiveSessions = activeSessions.filter(
    (s) => s.kombuse_session_id != null && activeBackends.has(s.kombuse_session_id)
  )

  // Aggregate status: pending > running > error > idle
  // Note: pending is determined client-side from pendingPermissions
  let status: AgentActivityStatus = 'idle'
  if (recentFailures.length > 0) {
    status = 'error'
  }
  if (trulyActiveSessions.length > 0) {
    status = 'running'
  }

  return { status, sessionCount: trulyActiveSessions.length }
}

/**
 * Broadcast aggregated agent status for a ticket to all connected clients.
 */
export function broadcastTicketAgentStatus(ticketId: number): void {
  const { status, sessionCount } = computeTicketAgentStatus(ticketId)
  wsHub.broadcastToTopic('*', {
    type: 'ticket.agent_status',
    ticketId,
    status,
    sessionCount,
  })
}

/**
 * Return enriched info about currently active sessions for the Active Agents Indicator.
 * Cross-references the in-memory activeBackends map so only truly running sessions are returned.
 */
export function getActiveSessions(): ActiveSessionInfo[] {
  const runningSessions = sessionsRepository.list({ status: 'running' })
  const results: ActiveSessionInfo[] = []

  for (const session of runningSessions) {
    if (!session.kombuse_session_id || !activeBackends.has(session.kombuse_session_id)) {
      continue
    }
    results.push({
      kombuseSessionId: session.kombuse_session_id,
      agentName: session.agent_name ?? 'Agent',
      ticketId: session.ticket_id ?? undefined,
      startedAt: session.started_at,
    })
  }

  return results
}

/**
 * Detect and abort sessions stuck in 'running' with no live backend.
 * Returns the number of orphaned sessions cleaned up.
 */
export function cleanupOrphanedSessions(): number {
  const runningSessions = sessionsRepository.list({ status: 'running' })
  let cleaned = 0
  const affectedTickets = new Set<number>()

  for (const session of runningSessions) {
    if (session.kombuse_session_id && !activeBackends.has(session.kombuse_session_id)) {
      sessionsRepository.update(session.id, { status: 'aborted' })
      if (session.ticket_id) affectedTickets.add(session.ticket_id)
      cleaned++
    }
  }

  for (const ticketId of affectedTickets) {
    broadcastTicketAgentStatus(ticketId)
  }

  return cleaned
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

/**
 * Known tool descriptions for generating human-readable permission context.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  // MCP Kombuse tools
  'mcp__kombuse__get_ticket': 'Read ticket details',
  'mcp__kombuse__add_comment': 'Add a comment to a ticket',
  'mcp__kombuse__create_ticket': 'Create a new ticket',
  'mcp__kombuse__update_comment': 'Update a comment',
  'mcp__kombuse__update_ticket': 'Update a ticket (status, labels, fields)',
  'mcp__kombuse__list_labels': 'List labels for a project',
  'mcp__kombuse__query_db': 'Query the database (read-only)',
  'mcp__kombuse__list_tables': 'List database tables',
  'mcp__kombuse__describe_table': 'Describe a database table',
  'mcp__kombuse__list_api_endpoints': 'List available API endpoints',
  'mcp__kombuse__call_api': 'Call a Kombuse API endpoint (GET)',
  'mcp__kombuse__list_agents': 'List agents',
  'mcp__kombuse__create_agent': 'Create a new agent',
  'mcp__kombuse__update_agent': 'Update an agent',
  // Common Claude Code tools
  'Bash': 'Run a shell command',
  'Read': 'Read a file',
  'Write': 'Write to a file',
  'Edit': 'Edit a file',
  'Glob': 'Search for files',
  'Grep': 'Search file contents',
  'WebFetch': 'Fetch content from a URL',
  'WebSearch': 'Search the web',
  'Task': 'Launch a subagent',
  'TodoWrite': 'Update task list',
  'AskUserQuestion': 'Ask the user a question',
  'ExitPlanMode': 'Submit implementation plan for review',
}

/**
 * Parse a Bash command and generate a human-readable description.
 */
function describeBashCommand(command: string): string {
  const trimmed = command.trim()
  const parts = trimmed.split(/\s+/)
  const cmd = parts[0] ?? ''

  if (!cmd) return 'Run command'

  // Extract the last path component for display
  const getShortPath = (path: string): string => {
    const segments = path.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    return last ?? path
  }

  // Find paths or file arguments in the command
  const findTarget = (): string | null => {
    for (let i = parts.length - 1; i >= 1; i--) {
      const part = parts[i]
      if (!part || part.startsWith('-')) continue
      if (part.includes('/') || !part.startsWith('-')) {
        return getShortPath(part)
      }
    }
    return null
  }

  const target = findTarget()
  const sub = parts[1] ?? ''
  const arg2 = parts[2] ?? ''

  // Git subcommand handling
  if (cmd === 'git') {
    const gitDesc: Record<string, string> = {
      'status': 'Check git status',
      'diff': 'Show git diff',
      'log': 'Show git log',
      'branch': 'List branches',
      'checkout': arg2 ? `Checkout ${arg2}` : 'Checkout',
      'switch': arg2 ? `Switch to ${arg2}` : 'Switch branch',
      'add': 'Stage changes',
      'commit': 'Create commit',
      'push': 'Push to remote',
      'pull': 'Pull from remote',
      'fetch': 'Fetch from remote',
      'merge': arg2 ? `Merge ${arg2}` : 'Merge',
      'rebase': 'Rebase',
      'stash': 'Stash changes',
      'clone': 'Clone repository',
      'reset': 'Reset changes',
      'show': arg2 ? `Show ${arg2}` : 'Show commit',
      'rev-parse': 'Resolve git reference',
    }
    return gitDesc[sub] ?? `git ${sub}`
  }

  // Package manager handling
  if (cmd === 'npm' || cmd === 'bun' || cmd === 'yarn' || cmd === 'pnpm') {
    if (!sub || sub === 'install' || sub === 'i') return 'Install dependencies'
    if (sub === 'run') return arg2 ? `Run: ${arg2}` : 'Run script'
    if (sub === 'test') return 'Run tests'
    if (sub === 'build') return 'Build project'
    if (sub === 'dev') return 'Start dev server'
    if (sub === 'add') return 'Add package'
    if (sub === 'remove') return 'Remove package'
    return `${cmd} ${sub}`
  }

  // Common commands
  const descriptions: Record<string, string> = {
    'ls': target ? `List files in ${target}` : 'List files',
    'cd': target ? `Change to ${target}` : 'Change directory',
    'cat': target ? `Read ${target}` : 'Read file',
    'head': target ? `Read start of ${target}` : 'Read file',
    'tail': target ? `Read end of ${target}` : 'Read file',
    'mkdir': target ? `Create ${target}/` : 'Create directory',
    'rm': target ? `Delete ${target}` : 'Delete files',
    'cp': 'Copy files',
    'mv': 'Move/rename files',
    'touch': target ? `Create ${target}` : 'Create file',
    'chmod': 'Change permissions',
    'find': target ? `Find files in ${target}` : 'Find files',
    'grep': 'Search in files',
    'node': target ? `Run ${target}` : 'Run Node.js',
    'python': target ? `Run ${target}` : 'Run Python',
    'python3': target ? `Run ${target}` : 'Run Python',
    'curl': 'Fetch URL',
    'wget': 'Download file',
    'make': target ? `make ${target}` : 'Run make',
    'docker': sub ? `docker ${sub}` : 'Docker command',
  }

  const desc = descriptions[cmd]
  if (desc) {
    return desc
  }

  // Fallback: command name + target
  if (target && target !== cmd) {
    return `${cmd} ${target}`
  }
  return cmd
}

/**
 * Generate a human-readable description for a permission request.
 */
function generatePermissionDescription(
  toolName: string,
  input: Record<string, unknown>
): string {
  // Special handling for Bash
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return describeBashCommand(input.command)
  }

  // Extract actual question text for AskUserQuestion
  if (toolName === 'AskUserQuestion' && Array.isArray(input.questions)) {
    const questions = input.questions as Array<Record<string, unknown>>
    const firstQ = questions[0]
    if (firstQ && typeof firstQ.question === 'string') {
      const questionText = firstQ.question as string
      const truncated = questionText.length > 120
        ? questionText.slice(0, 117) + '...'
        : questionText
      if (questions.length > 1) {
        return `${truncated} (+${questions.length - 1} more)`
      }
      return truncated
    }
  }

  // Show prompt count for ExitPlanMode
  if (toolName === 'ExitPlanMode' && Array.isArray(input.allowedPrompts)) {
    const count = (input.allowedPrompts as unknown[]).length
    if (count > 0) {
      return `Plan review: ${count} tool permission${count !== 1 ? 's' : ''} requested`
    }
  }

  const baseDescription = TOOL_DESCRIPTIONS[toolName]
  const contextParts: string[] = []

  // Handle ticket references
  if (typeof input.ticket_id === 'number') {
    contextParts.push(`ticket #${input.ticket_id}`)
  }

  // Handle file paths
  if (typeof input.file_path === 'string') {
    const path = input.file_path as string
    const shortPath = path.split('/').slice(-2).join('/')
    contextParts.push(shortPath)
  }

  // Handle patterns (Glob/Grep)
  if (typeof input.pattern === 'string') {
    contextParts.push(`"${input.pattern}"`)
  }

  // Handle URLs
  if (typeof input.url === 'string') {
    try {
      const url = new URL(input.url as string)
      contextParts.push(url.hostname)
    } catch {
      contextParts.push(input.url as string)
    }
  }

  // Compose final description
  if (baseDescription) {
    if (contextParts.length > 0) {
      return `${baseDescription}: ${contextParts.join(', ')}`
    }
    return baseDescription
  }

  // Fallback for unknown tools
  if (contextParts.length > 0) {
    return `${toolName}: ${contextParts.join(', ')}`
  }
  return toolName
}

export type AgentExecutionEvent =
  | { type: 'started'; kombuseSessionId: string; ticketId?: number; agentName?: string; startedAt?: string }
  | { type: 'event'; kombuseSessionId: string; event: AgentEvent }
  | {
      type: 'complete'
      kombuseSessionId: string
      backendSessionId?: string
      ticketId?: number
    }
  | { type: 'error'; message: string }

/**
 * Dependencies for agent execution (injectable for testing).
 *
 * Both `processEventAndRunAgents` (trigger-initiated) and `startAgentChatSession`
 * (user-initiated) now use the same chat infrastructure, ensuring consistent
 * persistence, streaming, and permission handling.
 */
interface AgentExecutionDependencies {
  getAgent: (agentId: string) => ReturnType<typeof agentService.getAgent>
  processEvent: (event: EventWithActor) => ReturnType<typeof agentService.processEvent>
  createBackend: () => AgentBackend
  generateSessionId: () => KombuseSessionId
  resolveProjectPath: () => string
  sessionPersistence: ISessionPersistenceService
}

/**
 * Server-standard backend factory for all agent execution paths.
 */
export function createServerAgentBackend(): AgentBackend {
  return new ClaudeCodeBackend()
}

const defaultDependencies: AgentExecutionDependencies = {
  getAgent: (agentId) => agentService.getAgent(agentId),
  processEvent: (event) => agentService.processEvent(event),
  createBackend: createServerAgentBackend,
  generateSessionId: () => createSessionId('chat'),
  resolveProjectPath: () => resolveDefaultProjectPath(),
  sessionPersistence: sessionPersistenceService,
}

/**
 * Emit an agent lifecycle event for ticket activity timeline.
 * Only emits if the invocation context includes a ticket_id.
 */
function emitAgentEvent(
  eventType: string,
  agentId: string,
  invocationId: number,
  context: Record<string, unknown>,
  additionalPayload?: Record<string, unknown>,
  kombuseSessionId?: string
): void {
  const ticketId = context.ticket_id as number | undefined
  const projectId = context.project_id as string | undefined

  if (!ticketId) {
    return // Only emit for ticket-related invocations
  }

  eventsRepository.create({
    event_type: eventType,
    ticket_id: ticketId,
    project_id: projectId,
    actor_id: agentId,
    actor_type: 'agent',
    kombuse_session_id: kombuseSessionId,
    payload: {
      invocation_id: invocationId,
      agent_id: agentId,
      ...additionalPayload,
    },
  })
}

/**
 * Result of building a trigger prompt — separates system prompt from user message.
 */
interface TriggerPrompt {
  /** Type preamble, rendered. Goes to --append-system-prompt. */
  systemPrompt: string
  /** Role-specific prompt + event context. Goes to initial user message. */
  userMessage: string
}

/**
 * Build a trigger prompt for a triggered agent invocation.
 * Separates type preamble (system prompt) from role instructions + event context (user message).
 *
 * Template variables available:
 * - {{ event_type }}, {{ ticket_id }}, {{ project_id }}, {{ kombuse_session_id }}
 * - {{ payload.field }} for event payload fields
 * - {{ ticket.title }}, {{ ticket.author.name }}, etc. for enriched context
 * - {{ project.name }}, {{ actor.name }}, etc.
 */
function buildTriggerPrompt(
  event: EventWithActor,
  agent: { system_prompt: string; config: { type?: string; [key: string]: unknown } },
  kombuseSessionId: string
): TriggerPrompt {
  // Build enriched context from event + session ID
  const templateContext = {
    ...buildTemplateContext(event),
    kombuse_session_id: kombuseSessionId,
  }

  // Layer 3: Type preamble → system prompt (via --append-system-prompt)
  const preset = getTypePreset(agent.config.type as string | undefined)
  const systemPrompt = preset.preambleTemplate
    ? renderTemplate(preset.preambleTemplate, templateContext)
    : ''

  // Layer 4+5: Role-specific prompt + event context → user message
  const lines: string[] = []
  if (agent.system_prompt) {
    const renderedRolePrompt = renderTemplate(agent.system_prompt, templateContext)
    lines.push(renderedRolePrompt, '')
  }

  // Append raw event context for reference
  lines.push(
    `Event: ${event.event_type}`,
    `Ticket: #${event.ticket_id ?? 'N/A'}`,
    `Project: ${event.project_id ?? 'N/A'}`,
    '',
    'Payload:',
    JSON.stringify(event.payload, null, 2),
  )

  const userMessage = lines.join('\n')
  console.log('[Server] Built trigger prompt for event:', {
    eventId: event.id,
    eventType: event.event_type,
    ticketId: event.ticket_id,
    projectId: event.project_id,
    systemPromptLength: systemPrompt.length,
    userMessage,
  })

  return { systemPrompt, userMessage }
}

/**
 * Resolve a project local path if available (used for triggered invocations).
 */
function resolveProjectPathForProject(projectId: string | null): string | undefined {
  if (!projectId) {
    return undefined
  }

  const project = projectService.get(projectId)
  const localPath = project?.local_path?.trim()

  if (!localPath) {
    return undefined
  }

  const candidatePath = resolvePath(localPath)

  try {
    if (statSync(candidatePath).isDirectory()) {
      return candidatePath
    }

    console.warn(
      `[Server] Project ${projectId} local_path is not a directory: ${candidatePath}`
    )
  } catch {
    console.warn(
      `[Server] Project ${projectId} local_path does not exist: ${candidatePath}`
    )
  }

  return undefined
}

/**
 * Resolve a deterministic default project path.
 * Uses the first project's local_path to ensure all invocations share the same cwd,
 * regardless of how the server process was started.
 * Falls back to process.cwd() only if no project has local_path configured.
 */
function resolveDefaultProjectPath(): string {
  const projects = projectService.list()
  for (const project of projects) {
    const resolved = resolveProjectPathForProject(project.id)
    if (resolved) return resolved
  }
  return process.cwd()
}

// Agent lifecycle events that should bypass the actor_type and session_id filters.
// These are allowed through so the Pipeline Orchestrator can chain agents.
const AGENT_LIFECYCLE_EVENTS = [
  EVENT_TYPES.AGENT_COMPLETED,
  EVENT_TYPES.AGENT_STARTED,
  EVENT_TYPES.AGENT_FAILED,
] as const

// Events that pass through the agent-origin filter. Includes lifecycle events
// (for chaining) and mention.created (so agents can @-mention other agents).
// Self-loop prevention: mention triggers require explicit mentioned_profile_id
// conditions, and the chain depth guard (MAX_CHAIN_DEPTH) bounds all loops.
const AGENT_PASSTHROUGH_EVENTS = [
  ...AGENT_LIFECYCLE_EVENTS,
  EVENT_TYPES.MENTION_CREATED,
] as const

// Maximum number of agent invocations per ticket within the time window
// before the chain depth guard halts execution to prevent infinite loops.
const MAX_CHAIN_DEPTH = 15

/**
 * Process a domain event by creating invocations and running them via chat infrastructure.
 * This ensures triggered agents have the same persistence, streaming, and permission handling as chat agents.
 */
export async function processEventAndRunAgents(
  event: EventWithActor,
  dependencies: AgentExecutionDependencies = defaultDependencies
): Promise<void> {
  console.log(
    `[Server] Processing event #${event.id} (${event.event_type}) for agent triggers...`
  )

  const isLifecycleEvent = (AGENT_LIFECYCLE_EVENTS as readonly string[]).includes(event.event_type)
  const isPassthroughEvent = (AGENT_PASSTHROUGH_EVENTS as readonly string[]).includes(event.event_type)

  // Only user-originated events trigger agents (except passthrough events like
  // agent lifecycle and mention.created, which enable pipeline chaining).
  if (event.actor_type !== 'user' && !isPassthroughEvent) {
    console.log(
      `[Server] Skipping non-user event #${event.id} (${event.event_type}, actor_type=${event.actor_type})`
    )
    return
  }

  // Skip events that already have an active session (e.g. user reply to
  // an agent comment handled via the WebSocket agent.invoke path).
  // Passthrough events are exempt: their session ID refers to the
  // originating agent's session, not an active handler for this event.
  if (event.kombuse_session_id && !isPassthroughEvent) {
    console.log(
      `[Server] Skipping event #${event.id} — session ${event.kombuse_session_id} already active`
    )
    return
  }

  const invocations = dependencies.processEvent(event)

  if (invocations.length === 0) {
    return
  }

  console.log(
    `[Server] Created ${invocations.length} invocation(s), running agents via chat infrastructure...`
  )

  for (const invocation of invocations) {
    const agent = dependencies.getAgent(invocation.agent_id)
    if (!agent) {
      console.warn(`[Server] Agent ${invocation.agent_id} not found for invocation #${invocation.id}`)
      continue
    }

    // Chain depth guard: prevent infinite agent loops on a ticket (#199)
    const ticketId = invocation.context.ticket_id as number | undefined
    if (ticketId) {
      const maxDepth = (agent.config?.max_chain_depth as number) ?? MAX_CHAIN_DEPTH
      const recentCount = agentInvocationsRepository.countRecentByTicketId(ticketId)
      if (recentCount >= maxDepth) {
        const errorMessage = `Chain depth limit reached (${maxDepth} invocations on ticket #${ticketId} in the last hour). Halting to prevent infinite loops.`
        console.warn(`[Server] ${errorMessage}`)
        agentInvocationsRepository.update(invocation.id, {
          status: 'failed',
          error: errorMessage,
          completed_at: new Date().toISOString(),
        })
        emitAgentEvent(
          EVENT_TYPES.AGENT_FAILED,
          invocation.agent_id,
          invocation.id,
          invocation.context,
          {
            error: errorMessage,
            completing_agent_id: invocation.agent_id,
            completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
          }
        )
        // Post a visible comment on the ticket so users know why agents stopped
        try {
          commentsRepository.create({
            ticket_id: ticketId,
            author_id: invocation.agent_id,
            body: `**Agent loop detected** — ${errorMessage}`,
          })
        } catch (commentError) {
          console.warn(`[Server] Failed to post chain depth comment on ticket #${ticketId}:`, commentError)
        }
        continue
      }
    }

    if (invocation.attempts >= invocation.max_attempts) {
      const errorMessage = `Invocation exceeded max attempts (${invocation.max_attempts})`
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      emitAgentEvent(
        EVENT_TYPES.AGENT_FAILED,
        invocation.agent_id,
        invocation.id,
        invocation.context,
        {
          error: errorMessage,
          completing_agent_id: invocation.agent_id,
          completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
        }
      )
      continue
    }

    // Reuse existing session ID from the event for lifecycle events (maintains
    // conversation continuity), otherwise generate a fresh one. Mention-triggered
    // agents get their own session since they're a new invocation context.
    const kombuseSessionId =
      event.kombuse_session_id && isValidSessionId(event.kombuse_session_id) && isLifecycleEvent
        ? event.kombuse_session_id
        : createSessionId('trigger')

    // Update invocation with session ID
    agentInvocationsRepository.update(invocation.id, {
      kombuse_session_id: kombuseSessionId,
      status: 'running',
      attempts: invocation.attempts + 1,
      started_at: new Date().toISOString(),
      error: null,
    })
    emitAgentEvent(
      EVENT_TYPES.AGENT_STARTED,
      invocation.agent_id,
      invocation.id,
      invocation.context,
      undefined,
      kombuseSessionId
    )

    // Build trigger prompt: separates system preamble from user message
    const triggerPrompt = buildTriggerPrompt(event, agent, kombuseSessionId)
    const projectPathOverride =
      resolveProjectPathForProject(event.project_id ?? null) ??
      dependencies.resolveProjectPath()

    let invocationFailed = false
    const markFailed = (message?: string) => {
      invocationFailed = true
      agentInvocationsRepository.update(invocation.id, {
        status: 'failed',
        error: message ?? 'Agent invocation failed',
        completed_at: new Date().toISOString(),
      })
      emitAgentEvent(
        EVENT_TYPES.AGENT_FAILED,
        invocation.agent_id,
        invocation.id,
        invocation.context,
        {
          error: message ?? 'Agent invocation failed',
          completing_agent_id: invocation.agent_id,
          completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
        },
        kombuseSessionId
      )
      // Broadcast updated ticket agent status on failure
      if (ticketIdFromContext) {
        broadcastTicketAgentStatus(ticketIdFromContext)
      }
    }

    // Extract ticket_id from invocation context
    const ticketIdFromContext = invocation.context.ticket_id as number | undefined

    // Use the same chat infrastructure as user-initiated sessions
    // Emit to broadcast topic so triggered sessions can be monitored
    startAgentChatSession(
      {
        type: 'agent.invoke',
        agentId: agent.id,
        message: triggerPrompt.userMessage,
        kombuseSessionId,
      },
      (evt) => {
        // Broadcast to session subscribers + wildcard for lifecycle events
        if (evt.type === 'started') {
          const msg: ServerMessage = {
            type: 'agent.started',
            kombuseSessionId: evt.kombuseSessionId,
            ticketId: evt.ticketId,
            agentName: evt.agentName,
            startedAt: evt.startedAt,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (evt.ticketId) {
            broadcastTicketAgentStatus(evt.ticketId)
          }
        } else if (evt.type === 'event') {
          if (evt.event.type === 'error') {
            markFailed(evt.event.message)
          }
          const serialized = serializeAgentStreamEvent(evt.event)
          if (serialized) {
            const msg: ServerMessage = {
              type: 'agent.event',
              kombuseSessionId: evt.kombuseSessionId,
              event: serialized,
            }
            // Only send to session subscribers — no wildcard for streaming events
            wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          }
        } else if (evt.type === 'complete') {
          if (!invocationFailed) {
            agentInvocationsRepository.update(invocation.id, {
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            emitAgentEvent(
              EVENT_TYPES.AGENT_COMPLETED,
              invocation.agent_id,
              invocation.id,
              invocation.context,
              {
                completing_agent_id: invocation.agent_id,
                completing_agent_type: (agent.config?.type as string) ?? 'kombuse',
              },
              kombuseSessionId
            )
          }
          const msg: ServerMessage = {
            type: 'agent.complete',
            kombuseSessionId: evt.kombuseSessionId,
            backendSessionId: evt.backendSessionId,
            ticketId: evt.ticketId,
          }
          wsHub.broadcastAgentMessage(evt.kombuseSessionId, msg)
          wsHub.broadcastToTopic('*', msg)
          if (evt.ticketId) {
            broadcastTicketAgentStatus(evt.ticketId)
          }
        } else if (evt.type === 'error') {
          markFailed(evt.message)
        }
      },
      dependencies,
      { projectPath: projectPathOverride, ticketId: ticketIdFromContext, systemPromptOverride: triggerPrompt.systemPrompt }
    )
  }
}

/**
 * Start a chat session initiated by a user websocket request.
 */
export function startAgentChatSession(
  message: AgentInvokeMessage,
  emit: (event: AgentExecutionEvent) => void,
  dependencies: AgentExecutionDependencies = defaultDependencies,
  options?: { projectPath?: string; ticketId?: number; systemPromptOverride?: string }
): void {
  const { agentId, message: userMessage, kombuseSessionId, projectId } = message

  const normalizedAgentId =
    typeof agentId === 'string' && agentId.trim().length > 0
      ? agentId.trim()
      : undefined
  let agent = normalizedAgentId
    ? dependencies.getAgent(normalizedAgentId)
    : undefined

  if (normalizedAgentId && !agent) {
    emit({
      type: 'error',
      message: `Agent ${normalizedAgentId} not found`,
    })
    return
  }

  if (agent && !agent.is_enabled) {
    emit({
      type: 'error',
      message: `Agent ${agent.id} is disabled`,
    })
    return
  }

  // For resumed sessions without explicit agentId, resolve from invocation records.
  // This handles user replies to agent comments — the UI sends kombuseSessionId
  // but not agentId (see tickets.tsx agent.invoke path).
  if (!agent && kombuseSessionId) {
    const invocations = agentInvocationsRepository.list({
      kombuse_session_id: kombuseSessionId,
      limit: 1,
    })
    const firstInvocation = invocations[0]
    if (firstInvocation) {
      const resolvedAgent = dependencies.getAgent(firstInvocation.agent_id)
      if (resolvedAgent?.is_enabled) {
        agent = resolvedAgent
        console.log(
          `[Server] Resolved agent ${resolvedAgent.id} from session ${kombuseSessionId}`
        )
      }
    }
  }

  // Use client-provided session ID or generate a new one
  let appSessionId: KombuseSessionId
  if (typeof kombuseSessionId === 'string' && isValidSessionId(kombuseSessionId.trim())) {
    appSessionId = kombuseSessionId.trim() as KombuseSessionId
  } else {
    appSessionId = dependencies.generateSessionId()
  }

  // Create/get persistent session record
  const persistentSessionId = dependencies.sessionPersistence.ensureSession(
    appSessionId,
    'claude-code',
    options?.ticketId
  )
  const existingSession = dependencies.sessionPersistence.getSession(
    persistentSessionId
  )
  // Use provided ticketId, or fall back to the existing session's ticket_id
  // (important for resumed sessions where the client doesn't pass ticketId)
  const ticketId = options?.ticketId ?? existingSession?.ticket_id ?? undefined
  const resumeSessionId =
    typeof existingSession?.backend_session_id === 'string' &&
    existingSession.backend_session_id.trim().length > 0
      ? existingSession.backend_session_id.trim()
      : undefined

  // Resolve agent display name for the Active Agents Indicator
  const agentName = agent
    ? (profilesRepository.get(agent.id)?.name ?? agent.id)
    : undefined

  // === PERSISTENT BACKEND REUSE PATH ===
  // If an active backend already exists for this session, reuse it by sending
  // the new message to the existing process instead of spawning a new one.
  const existingBackend = activeBackends.get(appSessionId)
  if (existingBackend && existingBackend.isRunning()) {
    clearBackendIdleTimeout(appSessionId)
    dependencies.sessionPersistence.markSessionRunning(persistentSessionId)

    const reusedLogger = createSessionLogger({
      kombuseSessionId: appSessionId,
      getBackendSessionId: () => existingBackend.getBackendSessionId(),
    })

    // Persist user message before sending
    const reusedUserEvent: AgentEvent = {
      type: 'message',
      eventId: crypto.randomUUID(),
      backend: 'claude-code',
      timestamp: Date.now(),
      role: 'user',
      content: userMessage,
    }
    dependencies.sessionPersistence.persistEvent(persistentSessionId, reusedUserEvent)

    emit({
      type: 'started',
      kombuseSessionId: appSessionId,
      ticketId,
      agentName,
      startedAt: new Date().toISOString(),
    })

    const agentType = (agent?.config as { type?: string } | undefined)?.type
    const preset = getTypePreset(agentType)
    let followUpDidCallAddComment = false
    let followUpLastAssistantMessage = ''

    runFollowUpChat(existingBackend, userMessage, appSessionId, {
      projectPath: '', // Not used for follow-up
      onEvent: (event: AgentEvent) => {
        reusedLogger.logEvent(event)
        dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

        if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
          followUpDidCallAddComment = true
        }
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
          followUpLastAssistantMessage = event.content
        }

        if (event.type === 'permission_request') {
          if (
            shouldAutoApprove(event.toolName, event.input, preset) &&
            'respondToPermission' in existingBackend &&
            typeof existingBackend.respondToPermission === 'function'
          ) {
            reusedLogger.info('auto-approving', { requestId: event.requestId, toolName: event.toolName })
            existingBackend.respondToPermission(event.requestId, 'allow', { updatedInput: event.input })
            const resolvedMsg: ServerMessage = {
              type: 'agent.permission_resolved',
              sessionId: appSessionId,
              requestId: event.requestId,
            }
            wsHub.broadcastToTopic('*', resolvedMsg)
            wsHub.broadcastToTopic(`session:${appSessionId}`, resolvedMsg)
            emit({
              type: 'event',
              kombuseSessionId: appSessionId,
              event: { ...event, autoApproved: true },
            })
            return
          }
          broadcastPermissionPending(appSessionId, event, ticketId)
        }

        emit({ type: 'event', kombuseSessionId: appSessionId, event })
      },
      onComplete: (context: ConversationContext) => {
        reusedLogger.close()
        resetBackendIdleTimeout(appSessionId)
        dependencies.sessionPersistence.completeSession(persistentSessionId, context.backendSessionId)

        if (ticketId && !followUpDidCallAddComment && followUpLastAssistantMessage.trim()) {
          const authorId = agent?.id ?? 'anonymous-agent'
          try {
            const sessionComments = commentsRepository.list({ ticket_id: ticketId, kombuse_session_id: appSessionId, limit: 50 })
            const userReply = sessionComments.filter((c) => c.author_id !== authorId).pop()
            commentsRepository.create({ ticket_id: ticketId, author_id: authorId, parent_id: userReply?.id, body: followUpLastAssistantMessage.trim(), kombuse_session_id: appSessionId })
          } catch { /* fallback comment failed */ }
        }

        emit({ type: 'complete', kombuseSessionId: appSessionId, backendSessionId: context.backendSessionId, ticketId })
      },
      onError: (error: Error) => {
        reusedLogger.close()
        unregisterBackend(appSessionId)

        const errorEvent: AgentEvent = {
          type: 'error',
          eventId: crypto.randomUUID(),
          backend: existingBackend.name,
          timestamp: Date.now(),
          message: error.message,
          error,
        }
        dependencies.sessionPersistence.persistEvent(persistentSessionId, errorEvent)
        dependencies.sessionPersistence.failSession(persistentSessionId)
        emit({ type: 'event', kombuseSessionId: appSessionId, event: errorEvent })
        emit({ type: 'complete', kombuseSessionId: appSessionId, ticketId })
        if (ticketId) broadcastTicketAgentStatus(ticketId)
      },
    })

    return // Skip normal createBackend/start path
  }

  dependencies.sessionPersistence.markSessionRunning(persistentSessionId)

  const backend = dependencies.createBackend()

  const logger = createSessionLogger({
    kombuseSessionId: appSessionId,
    getBackendSessionId: () => backend.getBackendSessionId(),
  })

  // Register backend before emitting 'started' so that
  // broadcastTicketAgentStatus (triggered by the emit callback)
  // finds this session in activeBackends and reports 'running'.
  registerBackend(appSessionId, backend)

  emit({
    type: 'started',
    kombuseSessionId: appSessionId,
    ticketId,
    agentName,
    startedAt: new Date().toISOString(),
  })

  // Persist user message before running agent
  const userMessageEvent: AgentEvent = {
    type: 'message',
    eventId: crypto.randomUUID(),
    backend: 'claude-code',
    timestamp: Date.now(),
    role: 'user',
    content: userMessage,
  }
  dependencies.sessionPersistence.persistEvent(persistentSessionId, userMessageEvent)

  const projectPathOverride =
    options?.projectPath ??
    (typeof projectId === 'string' && projectId.trim().length > 0
      ? resolveProjectPathForProject(projectId.trim())
      : undefined)

  // Resolve agent type preset for auto-approve decisions
  const agentType = (agent?.config as { type?: string } | undefined)?.type
  const preset = getTypePreset(agentType)

  // Determine system prompt:
  // - Triggered path: use pre-rendered systemPromptOverride (already template-rendered with event context)
  // - User-initiated path: render type preamble fresh with minimal context
  let resolvedSystemPrompt: string | undefined
  if (options?.systemPromptOverride) {
    resolvedSystemPrompt = options.systemPromptOverride
  } else if (agent && preset.preambleTemplate) {
    const preambleContext = {
      event_type: '',
      ticket_id: ticketId ?? null,
      project_id: projectId ?? null,
      comment_id: null,
      actor_id: null,
      actor_type: 'user' as const,
      payload: {} as Record<string, unknown>,
      kombuse_session_id: appSessionId,
      agents: profilesRepository.list({ type: 'agent', is_active: true }).map((p) => ({ id: p.id, name: p.name })),
    }
    resolvedSystemPrompt = renderTemplate(preset.preambleTemplate, preambleContext)

    // On sessions with prior context (resumed or history-fallback),
    // re-inject the agent's role prompt so it has system-level authority.
    if (agent.system_prompt && (resumeSessionId || existingSession)) {
      const renderedRolePrompt = renderTemplate(agent.system_prompt, preambleContext)
      resolvedSystemPrompt += `\n\n## Agent Role\n${renderedRolePrompt}`
    }

  }

  // Compute allowed tools for subprocess-level pre-approval
  const allowedTools = presetToAllowedTools(preset)

  // Track whether the agent posted a comment via add_comment during this session.
  // Used for fallback: if the agent produces text but never calls add_comment,
  // we auto-post its last assistant message as a comment on the ticket.
  let didCallAddComment = false
  let lastAssistantMessage = ''

  // Plan-to-comment bridge: when the agent uses ExitPlanMode, post/update
  // a plan comment on the ticket so stakeholders can review the approach.
  let planCommentId: number | undefined
  let exitPlanModeToolUseId: string | undefined

  runAgentChat(backend, userMessage, appSessionId, {
    projectPath: projectPathOverride ?? dependencies.resolveProjectPath(),
    resumeSessionId,
    systemPrompt: resolvedSystemPrompt,
    allowedTools,
    permissionMode: preset.permissionMode,
    onEvent: (event: AgentEvent) => {

      logger.logEvent(event)

      // Persist event to database
      dependencies.sessionPersistence.persistEvent(persistentSessionId, event)

      // Track add_comment tool calls and assistant messages for fallback
      if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
        didCallAddComment = true
      }
      if (event.type === 'message' && event.role === 'assistant' && event.content) {
        lastAssistantMessage = event.content
      }

      // Plan-to-comment bridge: capture ExitPlanMode tool_use ID, then post
      // the plan content as a ticket comment when the result arrives.
      if (event.type === 'tool_use' && event.name === 'ExitPlanMode') {
        exitPlanModeToolUseId = event.id
      }
      if (
        event.type === 'tool_result' &&
        exitPlanModeToolUseId &&
        event.toolUseId === exitPlanModeToolUseId &&
        ticketId &&
        !event.isError
      ) {
        exitPlanModeToolUseId = undefined
        const planText = typeof event.content === 'string'
          ? event.content
          : Array.isArray(event.content)
            ? event.content
                .filter((b): b is { type: string; text: string } =>
                  typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text'
                )
                .map((b) => b.text)
                .join('\n')
            : ''
        if (planText.trim()) {
          const authorId = agent?.id ?? 'anonymous-agent'
          // Strip "## Approved Plan:" prefix if present
          const marker = '## Approved Plan:\n'
          const markerIdx = planText.indexOf(marker)
          const cleanPlan = markerIdx !== -1
            ? planText.slice(markerIdx + marker.length).trim()
            : planText.trim()
          const commentBody = `**Implementation Plan**\n\n${cleanPlan}`
          try {
            if (planCommentId) {
              commentsRepository.update(planCommentId, { body: commentBody })
              logger.info('plan comment updated', { commentId: planCommentId, ticketId })
            } else {
              const created = commentsRepository.create({
                ticket_id: ticketId,
                author_id: authorId,
                body: commentBody,
                kombuse_session_id: appSessionId,
              })
              planCommentId = created.id
              logger.info('plan comment created', { commentId: planCommentId, ticketId })
            }
          } catch (planCommentError) {
            logger.info('plan comment failed', { ticketId, error: String(planCommentError) })
          }
        }
      }

      // Handle permission requests - check auto-approve BEFORE emitting
      if (event.type === 'permission_request') {
        if (
          shouldAutoApprove(event.toolName, event.input, preset) &&
          'respondToPermission' in backend &&
          typeof backend.respondToPermission === 'function'
        ) {
          logger.info('auto-approving', { requestId: event.requestId, toolName: event.toolName })
          backend.respondToPermission(event.requestId, 'allow', { updatedInput: event.input })
          const resolvedMsg: ServerMessage = {
            type: 'agent.permission_resolved',
            sessionId: appSessionId,
            requestId: event.requestId,
          }
          wsHub.broadcastToTopic('*', resolvedMsg)
          wsHub.broadcastToTopic(`session:${appSessionId}`, resolvedMsg)
          // Emit with autoApproved flag so UI can skip showing prompt
          emit({
            type: 'event',
            kombuseSessionId: appSessionId,
            event: { ...event, autoApproved: true },
          })
          return
        }
        // Not auto-approved - broadcast pending
        broadcastPermissionPending(appSessionId, event, ticketId)
      }

      // Emit to WebSocket
      emit({
        type: 'event',
        kombuseSessionId: appSessionId,
        event,
      })
    },
    onComplete: (context: ConversationContext) => {
      logger.close()
      // Keep backend alive for persistent reuse — start idle timeout instead of unregistering.
      // The idle timeout will clean up the backend if no follow-up message arrives.
      resetBackendIdleTimeout(appSessionId)

      // Install sentinel subscriber to catch unexpected process death between turns
      const sentinelUnsub = backend.subscribe((evt) => {
        if (evt.type === 'complete' && evt.reason === 'process_exit') {
          unregisterBackend(appSessionId)
          sentinelUnsub()
        }
      })

      // Mark session as completed
      dependencies.sessionPersistence.completeSession(
        persistentSessionId,
        context.backendSessionId
      )

      // Fallback: if the agent produced text but never called add_comment,
      // auto-post the last assistant message as a comment on the ticket.
      // This handles cases where --append-system-prompt doesn't propagate on --resume.
      if (ticketId && !didCallAddComment && lastAssistantMessage.trim()) {
        const authorId = agent?.id ?? 'anonymous-agent'
        try {
          // Find the user's reply comment to thread the fallback response under it
          const sessionComments = commentsRepository.list({
            ticket_id: ticketId,
            kombuse_session_id: appSessionId,
            limit: 50,
          })
          const userReply = sessionComments
            .filter((c) => c.author_id !== authorId)
            .pop()

          commentsRepository.create({
            ticket_id: ticketId,
            author_id: authorId,
            parent_id: userReply?.id,
            body: lastAssistantMessage.trim(),
            kombuse_session_id: appSessionId,
          })
          logger.info('fallback comment posted', { ticketId, parentId: userReply?.id })
        } catch (fallbackError) {
          logger.info('fallback comment failed', { ticketId, error: String(fallbackError) })
        }
      }

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        backendSessionId: context.backendSessionId,
        ticketId,
      })
    },
    onResumeFailed: resumeSessionId ? () => {
      logger.info('resume failed, retrying without --resume')
      unregisterBackend(appSessionId)

      // Reset state from failed primary run
      didCallAddComment = false
      lastAssistantMessage = ''

      // Build conversation summary as fallback memory
      let fallbackSystemPrompt = resolvedSystemPrompt
      const priorEvents = dependencies.sessionPersistence.getSessionEvents(persistentSessionId)
      const conversationHistory = buildConversationSummary(priorEvents)
      if (conversationHistory) {
        fallbackSystemPrompt = (fallbackSystemPrompt ?? '') +
          `\n\n## Prior Conversation\nThe following is the conversation history from a previous session. Use this context to maintain continuity.\n\n${conversationHistory}`
      }

      const retryBackend = dependencies.createBackend()
      registerBackend(appSessionId, retryBackend)

      runAgentChat(retryBackend, userMessage, appSessionId, {
        projectPath: projectPathOverride ?? dependencies.resolveProjectPath(),
        systemPrompt: fallbackSystemPrompt,
        allowedTools,
        permissionMode: preset.permissionMode,
        onEvent: (event: AgentEvent) => {
          logger.logEvent(event)
          dependencies.sessionPersistence.persistEvent(persistentSessionId, event)
          if (event.type === 'tool_use' && event.name === 'mcp__kombuse__add_comment') {
            didCallAddComment = true
          }
          if (event.type === 'message' && event.role === 'assistant' && event.content) {
            lastAssistantMessage = event.content
          }

          // Handle permission requests - check auto-approve BEFORE emitting
          if (event.type === 'permission_request') {
            if (
              shouldAutoApprove(event.toolName, event.input, preset) &&
              'respondToPermission' in retryBackend &&
              typeof retryBackend.respondToPermission === 'function'
            ) {
              logger.info('auto-approving', { requestId: event.requestId, toolName: event.toolName })
              retryBackend.respondToPermission(event.requestId, 'allow', { updatedInput: event.input })
              const resolvedMsg: ServerMessage = {
                type: 'agent.permission_resolved',
                sessionId: appSessionId,
                requestId: event.requestId,
              }
              wsHub.broadcastToTopic('*', resolvedMsg)
              wsHub.broadcastToTopic(`session:${appSessionId}`, resolvedMsg)
              emit({
                type: 'event',
                kombuseSessionId: appSessionId,
                event: { ...event, autoApproved: true },
              })
              return
            }
            // Not auto-approved - broadcast pending
            broadcastPermissionPending(appSessionId, event, ticketId)
          }

          emit({ type: 'event', kombuseSessionId: appSessionId, event })
        },
        onComplete: (context: ConversationContext) => {
          logger.close()
          resetBackendIdleTimeout(appSessionId)
          // Sentinel for process death between turns
          const retrySentinelUnsub = retryBackend.subscribe((evt) => {
            if (evt.type === 'complete' && evt.reason === 'process_exit') {
              unregisterBackend(appSessionId)
              retrySentinelUnsub()
            }
          })
          dependencies.sessionPersistence.completeSession(persistentSessionId, context.backendSessionId)
          if (ticketId && !didCallAddComment && lastAssistantMessage.trim()) {
            const authorId = agent?.id ?? 'anonymous-agent'
            try {
              const sessionComments = commentsRepository.list({ ticket_id: ticketId, kombuse_session_id: appSessionId, limit: 50 })
              const userReply = sessionComments.filter((c) => c.author_id !== authorId).pop()
              commentsRepository.create({ ticket_id: ticketId, author_id: authorId, parent_id: userReply?.id, body: lastAssistantMessage.trim(), kombuse_session_id: appSessionId })
            } catch { /* fallback comment failed */ }
          }
          emit({ type: 'complete', kombuseSessionId: appSessionId, backendSessionId: context.backendSessionId, ticketId })
        },
        onError: (error: Error) => {
          logger.close()
          unregisterBackend(appSessionId)
          const errorEvent: AgentEvent = { type: 'error', eventId: crypto.randomUUID(), backend: retryBackend.name, timestamp: Date.now(), message: error.message, error }
          dependencies.sessionPersistence.persistEvent(persistentSessionId, errorEvent)
          dependencies.sessionPersistence.failSession(persistentSessionId)
          emit({ type: 'event', kombuseSessionId: appSessionId, event: errorEvent })
          emit({ type: 'complete', kombuseSessionId: appSessionId, ticketId })
          if (ticketId) broadcastTicketAgentStatus(ticketId)
        },
      }).catch((retryError: unknown) => {
        logger.close()
        unregisterBackend(appSessionId)
        dependencies.sessionPersistence.failSession(persistentSessionId)
        emit({ type: 'error', message: `Failed to start agent (retry): ${retryError instanceof Error ? retryError.message : String(retryError)}` })
        emit({ type: 'complete', kombuseSessionId: appSessionId, ticketId })
        if (ticketId) broadcastTicketAgentStatus(ticketId)
      })
    } : undefined,
    onError: (error: Error) => {
      logger.close()
      // Clean up backend registry
      unregisterBackend(appSessionId)

      // Persist error event
      const errorEvent: AgentEvent = {
        type: 'error',
        eventId: crypto.randomUUID(),
        backend: backend.name,
        timestamp: Date.now(),
        message: error.message,
        error,
      }
      dependencies.sessionPersistence.persistEvent(
        persistentSessionId,
        errorEvent
      )

      // Mark session as failed
      dependencies.sessionPersistence.failSession(persistentSessionId)

      emit({
        type: 'event',
        kombuseSessionId: appSessionId,
        event: errorEvent,
      })

      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        ticketId,
      })

      // Broadcast updated ticket agent status
      if (ticketId) {
        broadcastTicketAgentStatus(ticketId)
      }
    },
  }).catch((error: unknown) => {
      logger.close()
      // Clean up backend registry
      unregisterBackend(appSessionId)

      const messageText =
        error instanceof Error ? error.message : String(error)

      // Mark session as failed on startup error
      dependencies.sessionPersistence.failSession(persistentSessionId)

      emit({
        type: 'error',
        message: `Failed to start agent: ${messageText}`,
      })
      emit({
        type: 'complete',
        kombuseSessionId: appSessionId,
        ticketId,
      })

      // Broadcast updated ticket agent status
      if (ticketId) {
        broadcastTicketAgentStatus(ticketId)
      }
    })
}

/**
 * Respond to a permission request for an active chat session.
 */
export function respondToPermission(message: PermissionResponseMessage): boolean {
  const { kombuseSessionId, requestId, behavior, updatedInput, message: denyMessage } = message

  const backend = activeBackends.get(kombuseSessionId)
  if (!backend) {
    console.warn(`[Server] No active backend for session ${kombuseSessionId}`)
    return false
  }

  // Check if backend supports respondToPermission
  if (!('respondToPermission' in backend) || typeof backend.respondToPermission !== 'function') {
    console.warn(`[Server] Backend does not support respondToPermission`)
    return false
  }

  backend.respondToPermission(requestId, behavior, {
    updatedInput,
    message: denyMessage,
  })

  // Persist the permission response as a session event
  const session = sessionPersistenceService.getSessionByKombuseId(kombuseSessionId)
  if (session) {
    sessionPersistenceService.persistEvent(session.id, {
      type: 'permission_response',
      eventId: crypto.randomUUID(),
      backend: backend.name,
      timestamp: Date.now(),
      requestId,
      behavior,
      message: denyMessage,
    })
  }

  // Broadcast resolution so all clients can update their UI
  const resolvedMsg: ServerMessage = {
    type: 'agent.permission_resolved',
    sessionId: kombuseSessionId,
    requestId,
  }
  wsHub.broadcastToTopic('*', resolvedMsg)
  wsHub.broadcastToTopic(`session:${kombuseSessionId}`, resolvedMsg)
  serverPendingPermissions.delete(requestId)

  return true
}
