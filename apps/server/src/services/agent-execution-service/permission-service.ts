import { createAppLogger } from '@kombuse/core/logger'
import { sessionPersistenceService } from '@kombuse/services'
import type { AgentEvent, ServerMessage } from '@kombuse/types'
import { wsHub } from '../../websocket/hub'
import {
  activeBackends,
  createPermissionKey,
  serverPendingPermissions,
  type ServerPendingPermission,
} from './runtime-state'
import type { PermissionResponseMessage } from './types'

const log = createAppLogger('PermissionService')

/**
 * Known tool descriptions for generating human-readable permission context.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  // MCP Kombuse tools
  'mcp__kombuse__get_ticket': 'Read ticket details',
  'mcp__kombuse__get_ticket_comment': 'Read a single ticket comment',
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

  const getShortPath = (path: string): string => {
    const segments = path.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    return last ?? path
  }

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

  if (target && target !== cmd) {
    return `${cmd} ${target}`
  }
  return cmd
}

/**
 * Generate a human-readable description for a permission request.
 */
export function generatePermissionDescription(
  toolName: string,
  input: Record<string, unknown>
): string {
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return describeBashCommand(input.command)
  }

  if (toolName === 'AskUserQuestion' && Array.isArray(input.questions)) {
    const questions = input.questions as Array<Record<string, unknown>>
    const firstQ = questions[0]
    if (firstQ && typeof firstQ.question === 'string') {
      const questionText = firstQ.question as string
      const truncated = questionText.length > 120
        ? `${questionText.slice(0, 117)}...`
        : questionText
      if (questions.length > 1) {
        return `${truncated} (+${questions.length - 1} more)`
      }
      return truncated
    }
  }

  if (toolName === 'ExitPlanMode' && Array.isArray(input.allowedPrompts)) {
    const count = (input.allowedPrompts as unknown[]).length
    if (count > 0) {
      return `Plan review: ${count} tool permission${count !== 1 ? 's' : ''} requested`
    }
  }

  const baseDescription = TOOL_DESCRIPTIONS[toolName]
  const contextParts: string[] = []

  if (typeof input.ticket_number === 'number') {
    contextParts.push(`ticket #${input.ticket_number}`)
  } else if (typeof input.ticket_id === 'number') {
    contextParts.push(`ticket #${input.ticket_id}`)
  }

  if (typeof input.file_path === 'string') {
    const path = input.file_path as string
    const shortPath = path.split('/').slice(-2).join('/')
    contextParts.push(shortPath)
  }

  if (typeof input.pattern === 'string') {
    contextParts.push(`"${input.pattern}"`)
  }

  if (typeof input.url === 'string') {
    try {
      const url = new URL(input.url as string)
      contextParts.push(url.hostname)
    } catch {
      contextParts.push(input.url as string)
    }
  }

  if (baseDescription) {
    if (contextParts.length > 0) {
      return `${baseDescription}: ${contextParts.join(', ')}`
    }
    return baseDescription
  }

  if (contextParts.length > 0) {
    return `${toolName}: ${contextParts.join(', ')}`
  }
  return toolName
}

export function getPendingPermissions(): ServerPendingPermission[] {
  return [...serverPendingPermissions.values()]
}

/**
 * Broadcast a permission request to all clients.
 */
export function broadcastPermissionPending(
  sessionId: string,
  event: Extract<AgentEvent, { type: 'permission_request' }>,
  ticketNumber?: number,
  projectId?: string
): void {
  const permissionKey = createPermissionKey(sessionId, event.requestId)
  const description = generatePermissionDescription(event.toolName, event.input)
  log.debug(`permission_request: ${event.requestId} ${event.toolName} - ${description}`)
  serverPendingPermissions.set(permissionKey, {
    permissionKey,
    sessionId,
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
    description,
    ticketNumber,
    projectId,
  })
  const msg: ServerMessage = {
    type: 'agent.permission_pending',
    permissionKey,
    sessionId,
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
    description,
    ticketNumber,
    projectId,
  }
  wsHub.broadcastToTopic('*', msg)
  wsHub.broadcastToTopic(`session:${sessionId}`, msg)
}

/**
 * Respond to a permission request for an active chat session.
 */
export function respondToPermission(message: PermissionResponseMessage): boolean {
  const { kombuseSessionId, requestId, behavior, updatedInput, message: denyMessage } = message
  const permissionKey = createPermissionKey(kombuseSessionId, requestId)

  const backend = activeBackends.get(kombuseSessionId)
  if (!backend) {
    log.warn(`No active backend for session ${kombuseSessionId}`)
    return false
  }

  if (!backend.respondToPermission) {
    log.warn('Backend does not support respondToPermission')
    return false
  }

  backend.respondToPermission(requestId, behavior, {
    updatedInput,
    message: denyMessage,
  })

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

  const resolvedMsg: ServerMessage = {
    type: 'agent.permission_resolved',
    permissionKey,
    sessionId: kombuseSessionId,
    requestId,
  }
  wsHub.broadcastToTopic('*', resolvedMsg)
  wsHub.broadcastToTopic(`session:${kombuseSessionId}`, resolvedMsg)
  serverPendingPermissions.delete(permissionKey)

  return true
}
