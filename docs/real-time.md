# Real-Time Updates

This doc is the high-level guide for real-time behavior.

Canonical protocol details live in `docs/architecture/websocket.md`.
Canonical lifecycle sequencing lives in `docs/architecture/agent-lifecycle.md`.

## What Real-Time Covers

Kombuse uses one WebSocket connection per client app session to synchronize:
- ticket/comment/label domain events
- agent run lifecycle state
- permission prompts and decisions
- ticket-level agent activity indicators

## Architecture Overview

```text
Browser Client(s)
   |
   | WebSocket /ws
   v
WebSocket Hub (topic routing)
   |
   +--> event broadcaster (project/ticket events)
   +--> agent execution stream (session lifecycle)
   +--> permission stream
```

## Topic Model (Overview)

| Topic | Typical use |
|------|-------------|
| `project:{id}` | project-level ticket activity |
| `ticket:{id}` | single-ticket activity |
| `session:{kombuseSessionId}` | one agent session lifecycle stream |
| `*` | global dashboards/app-level state |

## Common Message Families

| Family | Messages |
|-------|----------|
| Domain events | `event` |
| Agent lifecycle | `agent.started`, `agent.event`, `agent.complete` |
| Permission flow | `agent.permission_pending`, `agent.permission_resolved` |
| Ticket indicator | `ticket.agent_status` |
| Protocol control | `subscribed`, `unsubscribed`, `pong`, `error` |

For exact payload fields and enums, use `packages/types/src/websocket.ts`.

## Client Usage

### Shared provider

Wrap the app once with `WebSocketProvider`:

```tsx
import { WebSocketProvider } from '@kombuse/ui/providers'

export function App() {
  return (
    <WebSocketProvider url="ws://localhost:3331/ws">
      {/* app */}
    </WebSocketProvider>
  )
}
```

### Query cache refresh for domain events

Use `useRealtimeUpdates({ projectId })` or `useRealtimeUpdates({ ticketId })` to subscribe and invalidate relevant React Query caches.

### Lifecycle + permission state in app context

`AppProvider` subscribes to `*` and maintains:
- active sessions map
- pending permission map
- ticket agent status map

It also calls `/api/sync/state`:
- on mount for initial recovery
- every 30 seconds for reconciliation after disconnects/restarts

## Operational Notes

- Topic registration is centralized in the shared provider to avoid duplicate sockets.
- Reconnects use retry with jitter.
- Lifecycle stream completion is represented by `agent.complete` (not `agent.event` with `type: 'complete'`).

## Troubleshooting

- If updates do not appear, verify topic subscription first.
- If lifecycle indicators get stale after restarts, check `/api/sync/state` responses.
- If permission dialogs do not clear, inspect `agent.permission_resolved` handling in the app provider.
