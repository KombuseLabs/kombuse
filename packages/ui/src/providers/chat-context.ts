import { createContext } from 'react'
import type {
  BackendType,
  PublicSession,
  SerializedAgentEvent,
  SerializedAgentPermissionRequestEvent,
} from '@kombuse/types'

export interface ChatContextValue {
  /** Current events in the conversation */
  events: SerializedAgentEvent[]
  /** Whether the agent is currently processing */
  isLoading: boolean
  /** Whether the WebSocket is connected */
  isConnected: boolean
  /** Persisted lifecycle status for the current session */
  sessionStatus: PublicSession['status'] | null
  /** Machine-readable reason for the last terminal outcome */
  terminalReason: string | null
  /** Human-readable message for the last terminal outcome */
  terminalMessage: string | null
  /** Number of events returned by the latest history fetch for this session */
  historyLoadedCount: number | null
  /** Total matching events available for the latest history fetch */
  historyTotalCount: number | null
  /** Current app session ID (set after first message) */
  kombuseSessionId: string | null
  /** Backend session ID (available after session is fetched) */
  backendSessionId: string | null
  /** Effective backend resolved for this session */
  effectiveBackend: BackendType | null
  /** Model actually used by the backend (if known) */
  appliedModel: string | null
  /** Session model preference (if set) */
  modelPreference: string | null
  /** Agent name associated with the session (if any) */
  agentName: string | null
  /** Pending permission request awaiting user response */
  pendingPermission: SerializedAgentPermissionRequestEvent | null
  /** Send a message (with optional image files) to the agent */
  send: (message: string, files?: File[]) => void | Promise<void>
  /** Respond to a permission request */
  respondToPermission: (
    requestId: string,
    behavior: 'allow' | 'deny',
    message?: string,
    updatedInput?: Record<string, unknown>
  ) => void
  /** Clear events and reset conversation */
  reset: () => void
}

export const ChatCtx = createContext<ChatContextValue | null>(null)
