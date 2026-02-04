import { createContext } from 'react'
import type { SerializedAgentEvent } from '@kombuse/types'

export interface ChatContextValue {
  /** Current events in the conversation */
  events: SerializedAgentEvent[]
  /** Whether the agent is currently processing */
  isLoading: boolean
  /** Whether the WebSocket is connected */
  isConnected: boolean
  /** Current app session ID (set after first message) */
  kombuseSessionId: string | null
  /** Send a message to the agent */
  send: (message: string) => void
  /** Clear events and reset conversation */
  reset: () => void
}

export const ChatCtx = createContext<ChatContextValue | null>(null)
