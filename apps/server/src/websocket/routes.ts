import type { FastifyInstance } from 'fastify'
import type { RawData, WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { wsHub } from './hub'
import { serializeAgentStreamEvent } from './serialize-agent-event'
import { respondToPermission, startAgentChatSession } from '../services/agent-execution-service'

/**
 * WebSocket route handler for real-time event subscriptions.
 *
 * Protocol:
 * - Client connects to /ws
 * - Client sends { type: 'subscribe', topics: ['ticket:123'] }
 * - Server sends { type: 'subscribed', topics: ['ticket:123'] }
 * - When events occur, server sends { type: 'event', topic: 'ticket:123', event: {...} }
 */
export async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket, _req) => {
    wsHub.addClient(socket)

    socket.on('message', (rawMessage: RawData) => {
      try {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage

        switch (message.type) {
          case 'subscribe':
            wsHub.subscribe(socket, message.topics)
            sendServerMessage(socket, {
              type: 'subscribed',
              topics: message.topics,
            })
            break

          case 'unsubscribe':
            wsHub.unsubscribe(socket, message.topics)
            sendServerMessage(socket, {
              type: 'unsubscribed',
              topics: message.topics,
            })
            break

          case 'ping':
            sendServerMessage(socket, { type: 'pong' })
            break

          case 'agent.invoke':
            handleAgentInvoke(socket, message)
            break

          case 'permission.response':
            if (!respondToPermission(message)) {
              sendServerMessage(socket, {
                type: 'error',
                message: 'Failed to respond to permission request',
              })
            }
            break
        }
      } catch {
        sendServerMessage(socket, {
          type: 'error',
          message: 'Invalid message format',
        })
      }
    })

    socket.on('close', () => {
      wsHub.removeClient(socket)
    })

    socket.on('error', () => {
      wsHub.removeClient(socket)
    })
  })
}

function sendServerMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) {
    return
  }
  try {
    socket.send(JSON.stringify(message))
  } catch (error) {
    console.error('[ws.send] failed:', error)
  }
}

/**
 * Handle agent.invoke message - start a chat session with an agent
 */
function handleAgentInvoke(
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'agent.invoke' }>
) {
  startAgentChatSession(message, (event) => {
    switch (event.type) {
      case 'started':
        sendServerMessage(socket, {
          type: 'agent.started',
          kombuseSessionId: event.kombuseSessionId,
          ticketId: event.ticketId,
        })
        break
      case 'event': {
        const wsEvent = serializeAgentStreamEvent(event.event)
        if (!wsEvent) {
          return
        }
        sendServerMessage(socket, {
          type: 'agent.event',
          kombuseSessionId: event.kombuseSessionId,
          event: wsEvent,
        })
        break
      }
      case 'complete':
        sendServerMessage(socket, {
          type: 'agent.complete',
          kombuseSessionId: event.kombuseSessionId,
          backendSessionId: event.backendSessionId,
          ticketId: event.ticketId,
        })
        break
      case 'error':
        sendServerMessage(socket, {
          type: 'error',
          message: event.message,
        })
        break
    }
  })
}
