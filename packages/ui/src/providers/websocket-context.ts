import { createContext } from 'react'
import type { ServerMessage } from '@kombuse/types'

export type MessageHandler = (message: ServerMessage) => void

export interface WebSocketContextValue {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean
  /** Subscribe to specific topics */
  subscribe: (topics: string[]) => void
  /** Unsubscribe from topics */
  unsubscribe: (topics: string[]) => void
  /** Add a message handler */
  addMessageHandler: (handler: MessageHandler) => void
  /** Remove a message handler */
  removeMessageHandler: (handler: MessageHandler) => void
}

export const WebSocketCtx = createContext<WebSocketContextValue | null>(null)
