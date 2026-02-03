import type { WebSocket } from 'ws'
import type { WebSocketEvent, ServerMessage } from '@kombuse/types'

interface Client {
  ws: WebSocket
  topics: Set<string>
}

/**
 * WebSocket connection hub that manages clients and topic subscriptions.
 * Handles broadcasting events to subscribed clients.
 */
class WebSocketHub {
  private clients = new Map<WebSocket, Client>()
  private topicSubscribers = new Map<string, Set<WebSocket>>()

  /**
   * Register a new WebSocket connection
   */
  addClient(ws: WebSocket): void {
    this.clients.set(ws, { ws, topics: new Set() })
  }

  /**
   * Remove a WebSocket connection and clean up its subscriptions
   */
  removeClient(ws: WebSocket): void {
    const client = this.clients.get(ws)
    if (client) {
      for (const topic of client.topics) {
        this.topicSubscribers.get(topic)?.delete(ws)
      }
      this.clients.delete(ws)
    }
  }

  /**
   * Subscribe a client to one or more topics
   */
  subscribe(ws: WebSocket, topics: string[]): void {
    const client = this.clients.get(ws)
    if (!client) return

    for (const topic of topics) {
      client.topics.add(topic)
      if (!this.topicSubscribers.has(topic)) {
        this.topicSubscribers.set(topic, new Set())
      }
      this.topicSubscribers.get(topic)!.add(ws)
    }
  }

  /**
   * Unsubscribe a client from one or more topics
   */
  unsubscribe(ws: WebSocket, topics: string[]): void {
    const client = this.clients.get(ws)
    if (!client) return

    for (const topic of topics) {
      client.topics.delete(topic)
      this.topicSubscribers.get(topic)?.delete(ws)
    }
  }

  /**
   * Broadcast an event to all clients subscribed to relevant topics.
   * An event is sent to:
   * - `project:{project_id}` subscribers
   * - `ticket:{ticket_id}` subscribers
   * - `*` (wildcard) subscribers
   *
   * Each client receives the event at most once, even if subscribed to multiple matching topics.
   */
  broadcast(event: WebSocketEvent): void {
    const topics = this.getTopicsForEvent(event)
    const notifiedClients = new Set<WebSocket>()

    for (const topic of topics) {
      const subscribers = this.topicSubscribers.get(topic)
      if (!subscribers) continue

      for (const ws of subscribers) {
        if (notifiedClients.has(ws)) continue
        notifiedClients.add(ws)

        this.send(ws, {
          type: 'event',
          topic,
          event,
        })
      }
    }

    // Also send to wildcard subscribers
    const wildcardSubs = this.topicSubscribers.get('*')
    if (wildcardSubs) {
      for (const ws of wildcardSubs) {
        if (notifiedClients.has(ws)) continue
        this.send(ws, { type: 'event', topic: '*', event })
      }
    }
  }

  /**
   * Get connection count for monitoring
   */
  getClientCount(): number {
    return this.clients.size
  }

  /**
   * Broadcast a message directly to all clients subscribed to a specific topic.
   * Unlike `broadcast()`, this doesn't derive topics from event properties.
   */
  broadcastToTopic(topic: string, message: ServerMessage): void {
    const subscribers = this.topicSubscribers.get(topic)
    if (!subscribers) return

    for (const ws of subscribers) {
      this.send(ws, message)
    }
  }

  /**
   * Derive topics from event properties
   */
  private getTopicsForEvent(event: WebSocketEvent): string[] {
    const topics: string[] = []
    if (event.project_id) topics.push(`project:${event.project_id}`)
    if (event.ticket_id) topics.push(`ticket:${event.ticket_id}`)
    return topics
  }

  /**
   * Send a message to a client if the connection is open
   */
  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }
}

// Singleton instance
export const wsHub = new WebSocketHub()
