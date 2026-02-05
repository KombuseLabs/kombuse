import { createContext } from 'react'
import type { ClientMessage, ServerMessage } from '@kombuse/types'

export type MessageHandler = (message: ServerMessage) => void

export interface WebSocketContextValue {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean
  /** Send a message to the server */
  send: (message: ClientMessage) => void
  /** Register topics for a hook instance (preferred API, immune to Strict Mode) */
  registerTopics: (hookId: string, topics: string[]) => void
  /** Unregister topics when hook unmounts */
  unregisterTopics: (hookId: string) => void
  /** Add a message handler */
  addMessageHandler: (handler: MessageHandler) => void
  /** Remove a message handler */
  removeMessageHandler: (handler: MessageHandler) => void
}

export const WebSocketCtx = createContext<WebSocketContextValue | null>(null)
