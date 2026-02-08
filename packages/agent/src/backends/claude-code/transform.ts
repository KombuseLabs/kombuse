/**
 * Transforms Claude Code JSONL items into SerializedAgentEvent[].
 *
 * Extracts the normalization logic from ClaudeCodeBackend.normalizeEvent()
 * into a standalone pure function that works on JSONL file data.
 *
 * Key differences from the live backend:
 * - JSONL has 1 content block per assistant line (no streaming accumulation)
 * - User messages contain tool_result blocks (in live stream these come separately)
 * - JSONL-only types (progress, queue-operation, file-history-snapshot) are skipped
 * - Timestamps come from the JSONL item, not Date.now()
 */
import { BACKEND_TYPES, type SerializedAgentEvent, type JsonValue, type JsonObject } from '@kombuse/types'

const BACKEND = BACKEND_TYPES.CLAUDE_CODE

interface ContentBlock {
  type: string
  [key: string]: unknown
}

interface JsonlItem {
  type: string
  uuid?: string
  timestamp?: string
  message?: {
    role: string
    content: unknown
  }
  requestId?: string
  request_id?: string
  request?: {
    tool_name: string
    tool_use_id: string
    input: Record<string, unknown>
  }
  subtype?: string
  session_id?: string
  is_error?: boolean
  result?: string
  errors?: string[]
  [key: string]: unknown
}

function parseTimestamp(ts?: string): number {
  if (!ts) return 0
  const ms = new Date(ts).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function mapContentBlock(
  block: ContentBlock,
  role: 'assistant' | 'user',
  uuid: string,
  timestamp: number,
): SerializedAgentEvent | null {
  switch (block.type) {
    case 'text': {
      const text = block.text as string | undefined
      if (!text?.trim()) return null
      return {
        type: 'message',
        eventId: uuid,
        backend: BACKEND,
        timestamp,
        role,
        content: text,
      }
    }

    case 'tool_use':
      return {
        type: 'tool_use',
        eventId: uuid,
        backend: BACKEND,
        timestamp,
        id: block.id as string,
        name: block.name as string,
        input: (block.input ?? {}) as JsonObject,
      }

    case 'tool_result':
      return {
        type: 'tool_result',
        eventId: uuid,
        backend: BACKEND,
        timestamp,
        toolUseId: (block.tool_use_id as string) ?? '',
        content: block.content as string | JsonValue[],
        ...(block.is_error ? { isError: true } : {}),
      }

    case 'thinking':
      return {
        type: 'raw',
        eventId: uuid,
        backend: BACKEND,
        timestamp,
        sourceType: 'thinking',
        data: block as unknown as JsonValue,
      }

    default:
      return null
  }
}

function transformAssistant(item: JsonlItem): SerializedAgentEvent[] {
  const uuid = item.uuid ?? crypto.randomUUID()
  const timestamp = parseTimestamp(item.timestamp)
  const content = item.message?.content

  if (!Array.isArray(content)) {
    return [{
      type: 'raw',
      eventId: uuid,
      backend: BACKEND,
      timestamp,
      sourceType: 'assistant',
      data: item as unknown as JsonValue,
    }]
  }

  const events: SerializedAgentEvent[] = []
  for (let i = 0; i < content.length; i++) {
    const block = content[i] as ContentBlock
    const blockId = content.length === 1 ? uuid : `${uuid}-${i}`
    const mapped = mapContentBlock(block, 'assistant', blockId, timestamp)
    if (mapped) events.push(mapped)
  }

  if (events.length === 0) {
    events.push({
      type: 'raw',
      eventId: uuid,
      backend: BACKEND,
      timestamp,
      sourceType: 'assistant',
      data: item as unknown as JsonValue,
    })
  }

  return events
}

function transformUser(item: JsonlItem): SerializedAgentEvent[] {
  const uuid = item.uuid ?? crypto.randomUUID()
  const timestamp = parseTimestamp(item.timestamp)
  const content = item.message?.content

  if (!Array.isArray(content)) {
    return [{
      type: 'raw',
      eventId: uuid,
      backend: BACKEND,
      timestamp,
      sourceType: 'user',
      data: item as unknown as JsonValue,
    }]
  }

  const events: SerializedAgentEvent[] = []
  for (let i = 0; i < content.length; i++) {
    const block = content[i] as ContentBlock
    const blockId = content.length === 1 ? uuid : `${uuid}-${i}`
    const mapped = mapContentBlock(block, 'user', blockId, timestamp)
    if (mapped) events.push(mapped)
  }

  return events
}

function transformResult(item: JsonlItem): SerializedAgentEvent[] {
  const uuid = item.uuid ?? crypto.randomUUID()
  const timestamp = parseTimestamp(item.timestamp)
  const isSuccess = item.subtype === 'success' && !item.is_error

  const events: SerializedAgentEvent[] = [{
    type: 'complete',
    eventId: uuid,
    backend: BACKEND,
    timestamp,
    reason: 'result',
    sessionId: item.session_id,
    success: isSuccess,
  }]

  if (!isSuccess && Array.isArray(item.errors) && item.errors.length > 0) {
    events.push({
      type: 'error',
      eventId: `${uuid}-error`,
      backend: BACKEND,
      timestamp,
      message: item.errors.join('; '),
    })
  }

  return events
}

function transformControlRequest(item: JsonlItem): SerializedAgentEvent[] {
  const uuid = item.request_id ?? crypto.randomUUID()
  const timestamp = parseTimestamp(item.timestamp)

  if (!item.request) return []

  return [{
    type: 'permission_request',
    eventId: uuid,
    backend: BACKEND,
    timestamp,
    requestId: item.request_id ?? '',
    toolName: item.request.tool_name,
    toolUseId: item.request.tool_use_id,
    input: item.request.input as JsonObject,
  }]
}

function transformSystem(item: JsonlItem): SerializedAgentEvent[] {
  const uuid = item.uuid ?? crypto.randomUUID()
  const timestamp = parseTimestamp(item.timestamp)

  return [{
    type: 'raw',
    eventId: uuid,
    backend: BACKEND,
    timestamp,
    sourceType: item.subtype ?? 'system',
    data: item as unknown as JsonValue,
  }]
}

/**
 * Transform an array of raw Claude Code JSONL items into SerializedAgentEvent[].
 *
 * Skips JSONL-only metadata types (progress, queue-operation, file-history-snapshot)
 * and applies the same content-block mapping logic as ClaudeCodeBackend.normalizeEvent().
 */
export function transformJsonlToAgentEvents(
  items: Record<string, unknown>[],
): SerializedAgentEvent[] {
  const events: SerializedAgentEvent[] = []

  for (const raw of items) {
    const item = raw as unknown as JsonlItem

    switch (item.type) {
      case 'assistant':
        events.push(...transformAssistant(item))
        break

      case 'user':
        events.push(...transformUser(item))
        break

      case 'result':
        events.push(...transformResult(item))
        break

      case 'control_request':
        events.push(...transformControlRequest(item))
        break

      case 'system':
        events.push(...transformSystem(item))
        break

      // Skip JSONL-only metadata types
      case 'progress':
      case 'queue-operation':
      case 'file-history-snapshot':
        break

      default:
        break
    }
  }

  return events
}
