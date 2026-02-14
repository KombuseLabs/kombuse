import type {
  AgentEvent,
  AgentStreamEvent,
  JsonObject,
  JsonValue,
  SerializedAgentEvent,
  SerializedError,
} from '@kombuse/types'

const CIRCULAR_REFERENCE = '[Circular]'
const MAX_DEPTH = 8

/**
 * Serialize any agent event into a JSON-safe shape for wire transport.
 */
export function serializeAgentEvent(event: AgentEvent): SerializedAgentEvent {
  switch (event.type) {
    case 'message':
      return {
        ...event,
        raw: toOptionalJsonValue(event.raw),
      }

    case 'tool_use':
      return {
        ...event,
        input: toJsonObject(event.input),
        raw: toOptionalJsonValue(event.raw),
      }

    case 'tool_result':
      return {
        ...event,
        content:
          typeof event.content === 'string'
            ? event.content
            : event.content.map((item) => toJsonValue(item)),
        raw: toOptionalJsonValue(event.raw),
      }

    case 'permission_request':
      return {
        ...event,
        input: toJsonObject(event.input),
        raw: toOptionalJsonValue(event.raw),
      }

    case 'permission_response':
      return { ...event }

    case 'raw':
      return {
        ...event,
        data: toJsonValue(event.data),
      }

    case 'error':
      return {
        ...event,
        error: serializeError(event.error),
        raw: toOptionalJsonValue(event.raw),
      }

    case 'complete':
      return {
        ...event,
        raw: toOptionalJsonValue(event.raw),
      }

    case 'lifecycle':
      return { ...event }

    default:
      return assertNever(event)
  }
}

/**
 * Serialize stream events for websocket delivery.
 * `complete` and backend `lifecycle` events are skipped from `agent.event`.
 */
export function serializeAgentStreamEvent(event: AgentEvent): AgentStreamEvent | null {
  const serialized = serializeAgentEvent(event)
  if (serialized.type === 'complete' || serialized.type === 'lifecycle') {
    return null
  }
  return serialized
}

function serializeError(error: Error | undefined): SerializedError | undefined {
  if (!error) {
    return undefined
  }
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

function toOptionalJsonValue(value: unknown): JsonValue | undefined {
  return value === undefined ? undefined : toJsonValue(value)
}

function toJsonObject(input: Record<string, unknown>): JsonObject {
  const serialized = toJsonValue(input)
  return isJsonObject(serialized) ? serialized : {}
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonValue(value: unknown, depth = 0, seen = new WeakSet<object>()): JsonValue {
  if (depth > MAX_DEPTH) {
    return '[MaxDepthExceeded]'
  }

  if (value === null || value === undefined) {
    return null
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : String(value)
    case 'bigint':
      return value.toString()
    case 'symbol':
      return value.toString()
    case 'function':
      return '[Function]'
    case 'object':
      break
    default:
      return String(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, depth + 1, seen))
  }

  if (seen.has(value)) {
    return CIRCULAR_REFERENCE
  }
  seen.add(value)

  const out: JsonObject = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toJsonValue(entry, depth + 1, seen)
  }
  return out
}

function assertNever(value: never): never {
  throw new Error(`Unhandled agent event: ${JSON.stringify(value)}`)
}
