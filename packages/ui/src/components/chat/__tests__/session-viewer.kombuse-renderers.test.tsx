import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { JsonObject, JsonValue, SerializedAgentCompleteEvent, SerializedAgentErrorEvent, SerializedAgentEvent, SerializedAgentPermissionRequestEvent, SerializedAgentPermissionResponseEvent, SerializedAgentToolResultEvent, SerializedAgentToolUseEvent } from '@kombuse/types'
import { SessionViewer } from '../session-viewer'
import { KNOWN_KOMBUSE_TOOL_NAMES, getKombuseToolConfig } from '../renderers'

function makeToolUseEvent({
  id,
  name,
  input = {},
  timestamp,
}: {
  id: string
  name: string
  input?: JsonObject
  timestamp: number
}): SerializedAgentToolUseEvent {
  return {
    type: 'tool_use',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    id: `tool-${id}`,
    name,
    input,
  }
}

function makeToolResultEvent({
  id,
  toolUseId,
  content,
  timestamp,
  isError = false,
}: {
  id: string
  toolUseId: string
  content: string | JsonValue[]
  timestamp: number
  isError?: boolean
}): SerializedAgentToolResultEvent {
  return {
    type: 'tool_result',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    toolUseId,
    content,
    isError,
  }
}

function makeErrorEvent({
  id,
  message,
  timestamp,
  error,
}: {
  id: string
  message: string
  timestamp: number
  error?: SerializedAgentErrorEvent['error']
}): SerializedAgentErrorEvent {
  return {
    type: 'error',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    message,
    error,
  }
}

function makeCompleteEvent({
  id,
  reason,
  timestamp,
  success,
  exitCode,
  errorMessage,
  resumeFailed,
}: {
  id: string
  reason: SerializedAgentCompleteEvent['reason']
  timestamp: number
  success?: boolean
  exitCode?: number | null
  errorMessage?: string
  resumeFailed?: boolean
}): SerializedAgentCompleteEvent {
  return {
    type: 'complete',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    reason,
    success,
    exitCode,
    errorMessage,
    resumeFailed,
  }
}

function makePermissionRequestEvent({
  id,
  requestId,
  toolName,
  timestamp,
  input = {},
}: {
  id: string
  requestId: string
  toolName: string
  timestamp: number
  input?: JsonObject
}): SerializedAgentPermissionRequestEvent {
  return {
    type: 'permission_request',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    requestId,
    toolName,
    toolUseId: `tool-${id}`,
    input,
  }
}

function makePermissionResponseEvent({
  id,
  requestId,
  behavior,
  timestamp,
  message,
}: {
  id: string
  requestId: string
  behavior: 'allow' | 'deny'
  timestamp: number
  message?: string
}): SerializedAgentPermissionResponseEvent {
  return {
    type: 'permission_response',
    eventId: `evt-${id}`,
    backend: 'mock',
    timestamp,
    requestId,
    behavior,
    ...(message != null && { message }),
  }
}

const sampleInputsByToolName: Record<string, JsonObject> = {
  mcp__kombuse__get_ticket: { ticket_id: 7 },
  mcp__kombuse__get_ticket_comment: { comment_id: 3 },
  mcp__kombuse__add_comment: { ticket_id: 7, body: 'hello' },
  mcp__kombuse__create_ticket: { project_id: '1', title: 'New ticket' },
  mcp__kombuse__update_comment: { comment_id: 3, body: 'updated' },
  mcp__kombuse__list_tickets: { status: 'open' },
  mcp__kombuse__search_tickets: { query: 'renderer' },
  mcp__kombuse__list_projects: {},
  mcp__kombuse__list_labels: { project_id: '1' },
  mcp__kombuse__update_ticket: { ticket_id: 7, status: 'in_progress' },
  mcp__kombuse__query_db: { sql: 'SELECT * FROM tickets' },
  mcp__kombuse__list_tables: {},
  mcp__kombuse__describe_table: { table_name: 'tickets' },
  mcp__kombuse__list_api_endpoints: { method: 'GET' },
  mcp__kombuse__call_api: { path: '/api/tickets' },
  mcp__kombuse__list_agents: {},
  mcp__kombuse__create_agent: { id: 'agent-a', system_prompt: 'test' },
  mcp__kombuse__update_agent: { agent_id: 'agent-a' },
}

describe('SessionViewer kombuse renderers', () => {
  it('routes all known kombuse tools through the generic kombuse renderer', () => {
    const events = KNOWN_KOMBUSE_TOOL_NAMES.map((name, index) => makeToolUseEvent({
      id: `known-${index}`,
      name,
      input: sampleInputsByToolName[name] ?? {},
      timestamp: 1000 + index,
    }))

    const { queryAllByText, queryByText } = render(<SessionViewer events={events} />)

    for (const name of KNOWN_KOMBUSE_TOOL_NAMES) {
      const label = getKombuseToolConfig(name).label
      expect(queryAllByText(label).length).toBeGreaterThan(0)
    }

    expect(queryByText('kombuse[list_agents]')).toBeNull()
  })

  it('shows count summaries for list tools and pretty output on expand', () => {
    const toolUse = makeToolUseEvent({
      id: 'agents-use',
      name: 'mcp__kombuse__list_agents',
      input: {},
      timestamp: 2000,
    })
    const result = makeToolResultEvent({
      id: 'agents-result',
      toolUseId: toolUse.id,
      content: [{
        type: 'text',
        text: JSON.stringify({
          agents: [{ id: 'a' }, { id: 'b' }],
          count: 2,
        }),
      }],
      timestamp: 2001,
    })

    const { getByText, queryAllByText } = render(<SessionViewer events={[toolUse, result]} />)

    expect(getByText('List agents')).toBeDefined()
    expect(queryAllByText((_, node) => node?.textContent?.includes('2 agents') ?? false).length).toBeGreaterThan(0)

    fireEvent.click(getByText('List agents'))
    expect(queryAllByText((_, node) => node?.textContent?.includes('"count": 2') ?? false).length).toBeGreaterThan(0)
  })

  it('supports show more and show less for large payloads', () => {
    const rows = Array.from({ length: 16 }, (_, index) => ({
      id: index + 1,
      title: `Ticket ${index + 1}`,
      status: 'open',
    }))

    const toolUse = makeToolUseEvent({
      id: 'db-use',
      name: 'mcp__kombuse__query_db',
      input: { sql: 'SELECT * FROM tickets ORDER BY id DESC' },
      timestamp: 3000,
    })
    const result = makeToolResultEvent({
      id: 'db-result',
      toolUseId: toolUse.id,
      content: [{
        type: 'text',
        text: JSON.stringify({
          sql: 'SELECT * FROM tickets ORDER BY id DESC LIMIT 100',
          count: rows.length,
          rows,
        }),
      }],
      timestamp: 3001,
    })

    const { getAllByRole, getByText } = render(<SessionViewer events={[toolUse, result]} />)

    fireEvent.click(getByText('Query DB'))
    const showMoreButton = getAllByRole('button', { name: 'Show more' })[0]
    expect(showMoreButton).toBeDefined()

    fireEvent.click(showMoreButton!)
    expect(getAllByRole('button', { name: 'Show less' })[0]).toBeDefined()
  })

  it('renders kombuse errors with preserved payload in expanded view', () => {
    const toolUse = makeToolUseEvent({
      id: 'labels-use',
      name: 'mcp__kombuse__list_labels',
      input: { project_id: '1' },
      timestamp: 4000,
    })
    const result = makeToolResultEvent({
      id: 'labels-result',
      toolUseId: toolUse.id,
      content: '{"error":"Permission denied: labels"}',
      timestamp: 4001,
      isError: true,
    })

    const { getByText, queryAllByText } = render(<SessionViewer events={[toolUse, result]} />)

    expect(getByText('Permission denied: labels')).toBeDefined()
    fireEvent.click(getByText('List labels'))
    expect(queryAllByText((_, node) => node?.textContent?.includes('"error": "Permission denied: labels"') ?? false).length).toBeGreaterThan(0)
  })

  it('handles unknown kombuse tools with generic fallback metadata', () => {
    const toolUse = makeToolUseEvent({
      id: 'unknown-use',
      name: 'mcp__kombuse__custom_tool',
      input: { foo: 'bar' },
      timestamp: 5000,
    })
    const result = makeToolResultEvent({
      id: 'unknown-result',
      toolUseId: toolUse.id,
      content: '{"count":3}',
      timestamp: 5001,
    })

    const { getByText, queryAllByText, queryByText } = render(<SessionViewer events={[toolUse, result]} />)

    expect(getByText('Custom Tool')).toBeDefined()
    expect(queryAllByText((_, node) => node?.textContent?.includes('3 items') ?? false).length).toBeGreaterThan(0)
    expect(queryByText('kombuse[custom_tool]')).toBeNull()
  })

  it('renders error events with formatted stack traces', () => {
    const event = makeErrorEvent({
      id: 'error',
      message: 'Session crashed',
      timestamp: 5500,
      error: {
        name: 'RuntimeError',
        message: 'Command failed unexpectedly',
        stack: 'Error: crash\\n    at run (/tmp/task.ts:2:3)\\n    at main (/tmp/main.ts:9:1)',
      },
    })

    const { getByText, container } = render(<SessionViewer events={[event]} />)

    expect(getByText('RuntimeError')).toBeDefined()
    expect(getByText('Session crashed')).toBeDefined()
    expect(getByText('Command failed unexpectedly')).toBeDefined()

    const stackNode = container.querySelector('pre')
    expect(stackNode).not.toBeNull()
    expect(stackNode?.textContent).toContain('\n    at run (/tmp/task.ts:2:3)')
    expect(stackNode?.textContent).not.toContain('\\n')
  })

  it('renders complete events with success and failure states', () => {
    const successEvent = makeCompleteEvent({
      id: 'complete-success',
      reason: 'process_exit',
      timestamp: 5600,
      success: true,
      exitCode: 0,
    })
    const failedEvent = makeCompleteEvent({
      id: 'complete-failed',
      reason: 'failed',
      timestamp: 5601,
      success: false,
      exitCode: 1,
      errorMessage: 'The agent exited with errors',
      resumeFailed: true,
    })

    const { getByText, queryAllByText } = render(<SessionViewer events={[successEvent, failedEvent]} />)

    expect(getByText('Session Complete')).toBeDefined()
    expect(getByText('Session Failed')).toBeDefined()
    expect(queryAllByText('Reason').length).toBe(2)
    expect(getByText('process_exit')).toBeDefined()
    expect(getByText('failed')).toBeDefined()
    expect(getByText('exit 0')).toBeDefined()
    expect(getByText('exit 1')).toBeDefined()
    expect(getByText('The agent exited with errors')).toBeDefined()
    expect(getByText('Resume failed')).toBeDefined()
  })

  it('shows error events but hides complete events in clean mode', () => {
    const error = makeErrorEvent({
      id: 'clean-error',
      message: 'User-visible error',
      timestamp: 5701,
    })
    const complete = makeCompleteEvent({
      id: 'clean-complete',
      reason: 'result',
      timestamp: 5702,
      success: true,
    })

    const { getByText, queryByText } = render(<SessionViewer events={[error, complete]} viewMode="clean" />)

    expect(getByText('User-visible error')).toBeDefined()
    expect(queryByText('Session Complete')).toBeNull()
  })

  it('preserves fallback rendering for unknown event types', () => {
    const lifecycleEvent: SerializedAgentEvent = {
      type: 'lifecycle',
      eventId: 'evt-lifecycle',
      backend: 'mock',
      timestamp: 5800,
      state: 'running',
      reason: 'boot',
    }

    const { container } = render(<SessionViewer events={[lifecycleEvent]} />)

    expect(container.querySelector('pre')?.textContent).toContain('"type": "lifecycle"')
  })

  it('keeps non-kombuse renderer behavior unchanged', () => {
    const toolUse = makeToolUseEvent({
      id: 'glob-use',
      name: 'Glob',
      input: { pattern: '*.ts', path: '/workspace' },
      timestamp: 6000,
    })
    const result = makeToolResultEvent({
      id: 'glob-result',
      toolUseId: toolUse.id,
      content: [{
        type: 'text',
        text: 'src/index.ts\nsrc/app.ts',
      }],
      timestamp: 6001,
    })

    const { getByText } = render(<SessionViewer events={[toolUse, result]} />)

    expect(getByText('Glob')).toBeDefined()
    expect(getByText('2 files found')).toBeDefined()
  })

  it('renders permission_response allow with matching request tool name', () => {
    const request = makePermissionRequestEvent({
      id: 'perm-req',
      requestId: 'req-1',
      toolName: 'Bash',
      timestamp: 7000,
    })
    const response = makePermissionResponseEvent({
      id: 'perm-res',
      requestId: 'req-1',
      behavior: 'allow',
      timestamp: 7001,
    })

    const { container } = render(<SessionViewer events={[request, response]} />)

    const inlineRow = container.querySelector('.py-1\\.5')
    expect(inlineRow).not.toBeNull()
    expect(inlineRow?.textContent).toContain('Allowed')
    expect(inlineRow?.textContent).toContain('Bash')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('renders permission_response deny with message and tool name', () => {
    const request = makePermissionRequestEvent({
      id: 'perm-req-deny',
      requestId: 'req-2',
      toolName: 'Write',
      timestamp: 7100,
    })
    const response = makePermissionResponseEvent({
      id: 'perm-res-deny',
      requestId: 'req-2',
      behavior: 'deny',
      timestamp: 7101,
      message: 'use a different path',
    })

    const { container } = render(<SessionViewer events={[request, response]} />)

    const responseDiv = container.querySelectorAll('.text-muted-foreground')
    const texts = Array.from(responseDiv).map(el => el.textContent).join(' ')
    expect(texts).toContain('Denied')
    expect(texts).toContain('Write')
    expect(texts).toContain('use a different path')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('renders orphaned permission_response without tool name', () => {
    const response = makePermissionResponseEvent({
      id: 'perm-orphan',
      requestId: 'no-match',
      behavior: 'allow',
      timestamp: 7200,
    })

    const { container } = render(<SessionViewer events={[response]} />)

    const texts = Array.from(container.querySelectorAll('.text-muted-foreground')).map(el => el.textContent).join(' ')
    expect(texts).toContain('Allowed')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('hides permission_response events in clean mode', () => {
    const request = makePermissionRequestEvent({
      id: 'perm-req-clean',
      requestId: 'req-clean',
      toolName: 'Bash',
      timestamp: 7300,
    })
    const response = makePermissionResponseEvent({
      id: 'perm-res-clean',
      requestId: 'req-clean',
      behavior: 'allow',
      timestamp: 7301,
    })

    const { container } = render(<SessionViewer events={[request, response]} viewMode="clean" />)

    expect(container.textContent).not.toContain('Allowed')
    expect(container.textContent).not.toContain('Permission Request')
  })
})
