'use client'

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import type { ServerMessage } from '@kombuse/types'
import type { Message } from '../components/chat/session-viewer'
import { useWebSocket } from '../hooks/use-websocket'
import { ChatCtx } from './chat-context'

interface ChatProviderProps {
  children: ReactNode
  /** The agent ID to send messages to */
  agentId: string
}

/**
 * Provides chat state and actions to the component tree.
 * Handles WebSocket message parsing and state management.
 */
export function ChatProvider({ children, agentId }: ChatProviderProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'agent.started':
        setConversationId(message.conversationId)
        setIsLoading(true)
        break

      case 'agent.event': {
        const event = message.event

        switch (event.type) {
          case 'message':
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: event.data.content,
              },
            ])
            break

          case 'tool_use':
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: `Using tool: ${event.data.name}`,
                toolUse: { name: event.data.name, input: event.data.input },
              },
            ])
            break

          case 'error':
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: `Error: ${event.message}`,
              },
            ])
            break

          case 'raw': {
            // Extract text from raw Claude event
            const rawData = event.data as { message?: { content?: Array<{ type: string; text?: string }> } }
            const contentBlocks = rawData.message?.content
            if (Array.isArray(contentBlocks)) {
              const text = contentBlocks
                .filter((block) => block.type === 'text' && block.text)
                .map((block) => block.text)
                .join('')
              if (text) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: text,
                  },
                ])
              }
            }
            break
          }
        }
        break
      }

      case 'agent.complete':
        setIsLoading(false)
        break

      case 'error':
        setIsLoading(false)
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${message.message}`,
          },
        ])
        break
    }
  }, [])

  const { isConnected, send: wsSend } = useWebSocket({
    topics: [],
    onMessage: handleMessage,
  })

  const send = useCallback(
    (message: string) => {
      if (isLoading) return

      // Add user message to UI
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: message,
        },
      ])

      // Send to agent
      wsSend({
        type: 'agent.invoke',
        agentId,
        message,
        conversationId: conversationId ?? undefined,
      })
    },
    [agentId, conversationId, isLoading, wsSend]
  )

  const reset = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setIsLoading(false)
  }, [])

  const value = useMemo(
    () => ({
      messages,
      isLoading,
      isConnected,
      conversationId,
      send,
      reset,
    }),
    [messages, isLoading, isConnected, conversationId, send, reset]
  )

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>
}
