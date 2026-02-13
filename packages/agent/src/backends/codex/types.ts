export type JsonRpcId = string | number

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcRequest {
  id: JsonRpcId
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  method: string
  params?: unknown
}

export interface JsonRpcSuccessResponse {
  id: JsonRpcId
  result: unknown
}

export interface JsonRpcErrorResponse {
  id: JsonRpcId
  error: JsonRpcError
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export interface CodexInitializeParams {
  clientInfo: {
    name: string
    title: string | null
    version: string
  }
  capabilities: {
    experimentalApi: boolean
    optOutNotificationMethods?: string[] | null
  } | null
}

export interface CodexInitializeResponse {
  userAgent: string
}

export interface CodexThread {
  id: string
}

export interface CodexThreadStartParams {
  model?: string | null
  modelProvider?: string | null
  cwd?: string | null
  baseInstructions?: string | null
  developerInstructions?: string | null
  experimentalRawEvents: boolean
}

export interface CodexThreadResumeParams {
  threadId: string
  model?: string | null
  modelProvider?: string | null
  cwd?: string | null
  baseInstructions?: string | null
  developerInstructions?: string | null
}

export interface CodexThreadStartResponse {
  thread: CodexThread
}

export interface CodexThreadResumeResponse {
  thread: CodexThread
}

export type CodexTurnStatus = 'inProgress' | 'completed' | 'failed' | 'interrupted'

export interface CodexTurn {
  id: string
  status: CodexTurnStatus
  error?: {
    message: string
    additionalDetails?: string | null
  } | null
}

export interface CodexUserInputText {
  type: 'text'
  text: string
  text_elements: unknown[]
}

export interface CodexTurnStartParams {
  threadId: string
  input: CodexUserInputText[]
}

export interface CodexTurnStartResponse {
  turn: CodexTurn
}

export interface CodexTurnInterruptParams {
  threadId: string
  turnId: string
}

export interface CodexThreadItemAgentMessage {
  type: 'agentMessage'
  id: string
  text: string
}

export type CodexCommandExecutionStatus = 'inProgress' | 'completed' | 'failed' | 'declined'

export interface CodexThreadItemCommandExecution {
  type: 'commandExecution'
  id: string
  command: string
  cwd: string
  status: CodexCommandExecutionStatus
  commandActions?: unknown[]
  aggregatedOutput?: string | null
  exitCode?: number | null
}

export type CodexFileChangeStatus = 'inProgress' | 'completed' | 'failed' | 'declined'

export interface CodexThreadItemFileChange {
  type: 'fileChange'
  id: string
  status: CodexFileChangeStatus
  changes?: unknown[]
}

export type CodexMcpToolCallStatus = 'inProgress' | 'completed' | 'failed'

export interface CodexMcpToolCallResult {
  content?: unknown[]
  structuredContent?: unknown
}

export interface CodexMcpToolCallError {
  message: string
}

export interface CodexThreadItemMcpToolCall {
  type: 'mcpToolCall'
  id: string
  server: string
  tool: string
  status: CodexMcpToolCallStatus
  arguments: unknown
  result?: CodexMcpToolCallResult | null
  error?: CodexMcpToolCallError | null
}

export interface CodexThreadItemUnknown {
  type: string
  id?: string
  [key: string]: unknown
}

export type CodexThreadItem =
  | CodexThreadItemAgentMessage
  | CodexThreadItemCommandExecution
  | CodexThreadItemFileChange
  | CodexThreadItemMcpToolCall
  | CodexThreadItemUnknown

export interface CodexThreadStartedNotificationParams {
  thread: CodexThread
}

export interface CodexTurnStartedNotificationParams {
  threadId: string
  turn: CodexTurn
}

export interface CodexTurnCompletedNotificationParams {
  threadId: string
  turn: CodexTurn
}

export interface CodexItemNotificationParams {
  threadId: string
  turnId: string
  item: CodexThreadItem
}

export interface CodexErrorNotificationParams {
  threadId: string
  turnId: string
  willRetry: boolean
  error: {
    message: string
    additionalDetails?: string | null
  }
}

export interface CodexCommandApprovalParams {
  itemId: string
  command?: string | null
  cwd?: string | null
  reason?: string | null
  threadId: string
  turnId: string
  commandActions?: unknown[] | null
}

export type CodexCommandApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: unknown
      }
    }

export interface CodexCommandApprovalResponse {
  decision: CodexCommandApprovalDecision
}

export interface CodexFileChangeApprovalParams {
  itemId: string
  grantRoot?: string | null
  reason?: string | null
  threadId: string
  turnId: string
}

export type CodexFileChangeApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'

export interface CodexFileChangeApprovalResponse {
  decision: CodexFileChangeApprovalDecision
}
