import type { FastifyInstance } from 'fastify'
import type { RawData } from 'ws'
import type { ClientMessage, ServerMessage } from '@kombuse/types'
import { wsHub } from './hub'

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
            socket.send(
              JSON.stringify({
                type: 'subscribed',
                topics: message.topics,
              } satisfies ServerMessage)
            )
            break

          case 'unsubscribe':
            wsHub.unsubscribe(socket, message.topics)
            socket.send(
              JSON.stringify({
                type: 'unsubscribed',
                topics: message.topics,
              } satisfies ServerMessage)
            )
            break

          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' } satisfies ServerMessage))
            break
        }
      } catch {
        socket.send(
          JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          } satisfies ServerMessage)
        )
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
