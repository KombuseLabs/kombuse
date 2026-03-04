import { createAppLogger } from '@kombuse/core/logger'
import type { FastifyInstance } from 'fastify'
import type { RawData, WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { wsHub } from './hub'
import { serializeAgentStreamEvent } from './serialize-agent-event'
import { resolveTicketId } from '@kombuse/persistence'
import { respondToPermission, startAgentChatSession, stopAgentSession } from '../services/agent-execution-service'

const log = createAppLogger('WebSocket')

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
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const origin = req.headers.origin
    if (
      origin &&
      origin !== 'app://.' &&
      !origin.startsWith('http://localhost:') &&
      !origin.startsWith('http://127.0.0.1:')
    ) {
      socket.close(1008, 'Origin not allowed')
      return
    }

    wsHub.addClient(socket)

    socket.on('message', (rawMessage: RawData) => {
      let message: ClientMessage
      try {
        message = JSON.parse(rawMessage.toString()) as ClientMessage
      } catch {
        sendServerMessage(socket, {
          type: 'error',
          message: 'Invalid message format',
        })
        return
      }

      try {
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

          case 'agent.stop':
            if (!stopAgentSession(message.kombuseSessionId)) {
              sendServerMessage(socket, {
                type: 'error',
                message: 'No active agent to stop for this session',
              })
            }
            break
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to process websocket message'
        log.error('Failed to process websocket message', { error: error instanceof Error ? error.message : String(error) })
        sendServerMessage(socket, { type: 'error', message: errorMessage })
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
    log.error('Failed to send websocket message', { error: error instanceof Error ? error.message : String(error) })
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
      case 'started': {
        const msg: ServerMessage = {
          type: 'agent.started',
          kombuseSessionId: event.kombuseSessionId,
          ticketNumber: event.ticketNumber,
          ticketTitle: event.ticketTitle,
          projectId: event.projectId,
          agentName: event.agentName,
          effectiveBackend: event.effectiveBackend,
          appliedModel: event.appliedModel,
          startedAt: event.startedAt,
        }
        wsHub.broadcastAgentMessage(event.kombuseSessionId, msg, socket)
        wsHub.broadcastToTopic('*', msg, socket)
        break
      }
      case 'event': {
        const wsEvent = serializeAgentStreamEvent(event.event)
        if (!wsEvent) {
          return
        }
        const msg: ServerMessage = {
          type: 'agent.event',
          kombuseSessionId: event.kombuseSessionId,
          event: wsEvent,
        }
        wsHub.broadcastAgentMessage(event.kombuseSessionId, msg, socket)
        break
      }
      case 'complete': {
        const msg: ServerMessage = {
          type: 'agent.complete',
          kombuseSessionId: event.kombuseSessionId,
          backendSessionId: event.backendSessionId,
          ticketNumber: event.ticketNumber,
          projectId: event.projectId,
          status: event.status,
          reason: event.reason,
          errorMessage: event.errorMessage,
        }
        wsHub.broadcastAgentMessage(event.kombuseSessionId, msg, socket)
        wsHub.broadcastToTopic('*', msg, socket)
        break
      }
      case 'error':
        sendServerMessage(socket, {
          type: 'error',
          message: event.message,
        })
        break
    }
  }, undefined, {
    ticketId: message.ticketNumber && message.projectId
      ? (() => { try { return resolveTicketId(message.projectId!, message.ticketNumber!) } catch { return undefined } })()
      : undefined,
  })
}
