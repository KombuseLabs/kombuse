/**
 * Zod schemas for Claude Code JSONL file format.
 *
 * These mirror the TypeScript interfaces in ./types.ts for the SDK event types
 * and add schemas for JSONL-only types (progress, queue-operation, file-history-snapshot)
 * that are stored in ~/.claude/projects/ session files but not emitted via --output-format stream-json.
 */
import { z } from 'zod'

// =============================================================================
// Content Blocks
// =============================================================================

const textBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).passthrough()

const thinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
}).passthrough()

const toolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
}).passthrough()

const toolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]),
}).passthrough()

export const claudeContentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  thinkingBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
])

// =============================================================================
// Common metadata present on most JSONL items (not part of SDK types)
// =============================================================================

const jsonlMetadataSchema = z.object({
  parentUuid: z.string().nullable().optional(),
  isSidechain: z.boolean().optional(),
  userType: z.string().optional(),
  cwd: z.string().optional(),
  sessionId: z.string(),
  version: z.string().optional(),
  gitBranch: z.string().optional(),
  slug: z.string().optional(),
  uuid: z.string(),
  timestamp: z.string(),
})

// =============================================================================
// SDK Message Types (also present in JSONL files)
// =============================================================================

export const claudeSystemMessageSchema = jsonlMetadataSchema.extend({
  type: z.literal('system'),
  subtype: z.string(),
  session_id: z.string().optional(),
  tools: z.array(z.string()).optional(),
  mcp_servers: z.array(z.object({
    name: z.string(),
    status: z.string(),
  })).optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  apiKeySource: z.string().optional(),
  slash_commands: z.array(z.string()).optional(),
  output_style: z.string().optional(),
}).passthrough()

export const claudeAssistantMessageSchema = jsonlMetadataSchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    role: z.literal('assistant'),
    content: z.array(claudeContentBlockSchema),
  }).passthrough(),
  requestId: z.string().optional(),
}).passthrough()

export const claudeUserMessageSchema = jsonlMetadataSchema.extend({
  type: z.literal('user'),
  message: z.object({
    role: z.literal('user'),
    content: z.union([z.array(z.unknown()), z.unknown()]),
  }).passthrough(),
  permissionMode: z.string().optional(),
  isMeta: z.boolean().optional(),
  toolUseResult: z.unknown().optional(),
  todos: z.unknown().optional(),
  sourceToolAssistantUUID: z.string().optional(),
}).passthrough()

export const claudeResultSuccessSchema = jsonlMetadataSchema.extend({
  type: z.literal('result'),
  subtype: z.literal('success'),
  session_id: z.string(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  is_error: z.boolean(),
  num_turns: z.number(),
  result: z.string(),
  total_cost_usd: z.number(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }).passthrough(),
}).passthrough()

export const claudeResultErrorSchema = jsonlMetadataSchema.extend({
  type: z.literal('result'),
  subtype: z.enum([
    'error_max_turns',
    'error_during_execution',
    'error_max_budget_usd',
    'error_max_structured_output_retries',
  ]),
  session_id: z.string(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  is_error: z.boolean(),
  num_turns: z.number(),
  total_cost_usd: z.number(),
  errors: z.array(z.string()),
}).passthrough()

export const claudeControlRequestSchema = z.object({
  type: z.literal('control_request'),
  request_id: z.string(),
  request: z.object({
    subtype: z.literal('can_use_tool'),
    tool_name: z.string(),
    tool_use_id: z.string(),
    input: z.record(z.unknown()),
  }),
}).passthrough()

// =============================================================================
// JSONL-only types (not in SDK stream-json output)
// =============================================================================

export const claudeProgressMessageSchema = jsonlMetadataSchema.extend({
  type: z.literal('progress'),
  data: z.unknown(),
  toolUseID: z.string().optional(),
  parentToolUseID: z.string().optional(),
}).passthrough()

export const claudeQueueOperationSchema = z.object({
  type: z.literal('queue-operation'),
  operation: z.string(),
  timestamp: z.string(),
  sessionId: z.string(),
}).passthrough()

export const claudeFileHistorySnapshotSchema = z.object({
  type: z.literal('file-history-snapshot'),
  messageId: z.string(),
  snapshot: z.unknown(),
  isSnapshotUpdate: z.boolean().optional(),
}).passthrough()

// =============================================================================
// Top-level discriminated union
// =============================================================================

export const claudeJsonlItemSchema = z.discriminatedUnion('type', [
  claudeSystemMessageSchema,
  claudeAssistantMessageSchema,
  claudeUserMessageSchema,
  claudeProgressMessageSchema,
  claudeQueueOperationSchema,
  claudeFileHistorySnapshotSchema,
  claudeControlRequestSchema,
  // Note: 'result' cannot be in the same discriminated union because both
  // success and error share type='result'. Use claudeResultSchema separately.
])

/** Validates result messages (success or error) - separate because they share type='result' */
export const claudeResultSchema = z.union([
  claudeResultSuccessSchema,
  claudeResultErrorSchema,
])

/**
 * Validate a single JSONL item. Handles both the discriminated union types
 * and result types which share the same type discriminator.
 */
export function validateJsonlItem(item: unknown): z.SafeParseReturnType<unknown, unknown> {
  if (typeof item === 'object' && item !== null && 'type' in item) {
    if ((item as Record<string, unknown>).type === 'result') {
      return claudeResultSchema.safeParse(item)
    }
  }
  return claudeJsonlItemSchema.safeParse(item)
}

// =============================================================================
// Inferred types
// =============================================================================

export type ClaudeJsonlItem = z.infer<typeof claudeJsonlItemSchema>
export type ClaudeJsonlAssistantMessage = z.infer<typeof claudeAssistantMessageSchema>
export type ClaudeJsonlUserMessage = z.infer<typeof claudeUserMessageSchema>
export type ClaudeJsonlProgressMessage = z.infer<typeof claudeProgressMessageSchema>
