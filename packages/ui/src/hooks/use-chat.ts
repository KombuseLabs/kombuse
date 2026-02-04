import { useContext } from 'react'
import { ChatCtx, type ChatContextValue } from '../providers/chat-context'

/**
 * Hook to access the chat context.
 * Must be used within a ChatProvider.
 */
export function useChat(): ChatContextValue {
  const context = useContext(ChatCtx)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
