import { createContext } from 'react'
import type { Message } from '../components/chat/session-viewer'

export interface ChatContextValue {
  /** Current messages in the conversation */
  messages: Message[]
  /** Whether the agent is currently processing */
  isLoading: boolean
  /** Whether the WebSocket is connected */
  isConnected: boolean
  /** Current conversation ID (set after first message) */
  conversationId: string | null
  /** Send a message to the agent */
  send: (message: string) => void
  /** Clear messages and reset conversation */
  reset: () => void
}

export const ChatCtx = createContext<ChatContextValue | null>(null)
