# WebSocket Architecture

`docs/architecture/websocket.md` is the protocol source of truth for WebSocket behavior.

Related docs:
- Overview: `docs/real-time.md`
- Lifecycle details: `docs/architecture/agent-lifecycle.md`

## Endpoint

Clients connect to `ws://localhost:3331/ws`.

## Topic Subscription Model

Subscriptions are explicit and dynamic:

```json
{ "type": "subscribe", "topics": ["project:proj-1", "ticket:123", "session:chat_abc", "*"] }
```

```json
{ "type": "unsubscribe", "topics": ["session:chat_abc"] }
```

Supported topic patterns:

| Topic | Purpose | Primary producers |
|------|---------|-------------------|
| `project:{id}` | Project-scoped domain events | Event broadcaster (`event` messages) |
| `ticket:{id}` | Ticket-scoped domain events | Event broadcaster (`event` messages) |
| `session:{kombuseSessionId}` | Agent session lifecycle stream | `agent.started`, `agent.event`, `agent.complete`, permission messages |
| `*` | Global feed for dashboards/debug/global UI state | Domain events + lifecycle/status broadcasts |

## Protocol

### Client -> Server messages

| `type` | Payload | Handled by |
|-------|---------|------------|
| `subscribe` | `{ topics: string[] }` | `wsHub.subscribe(...)` |
| `unsubscribe` | `{ topics: string[] }` | `wsHub.unsubscribe(...)` |
| `ping` | none | immediate `pong` response |
| `agent.invoke` | `{ agentId?, message, kombuseSessionId?, projectId?, backendType?, modelPreference? }` | `startAgentChatSession(...)` |
| `permission.response` | `{ kombuseSessionId, requestId, behavior, updatedInput?, message? }` | `respondToPermission(...)` |
| `agent.stop` | `{ kombuseSessionId }` | `stopAgentSession(...)` |

### Server -> Client messages

The canonical union is `ServerMessage` in `packages/types/src/websocket.ts`.

| `type` | Payload summary | Broadcast scope |
|-------|------------------|-----------------|
| `event` | `{ topic, event }` domain event envelope | derived `project:*` / `ticket:*` topics and `*` |
| `subscribed` / `unsubscribed` | `{ topics: string[] }` | request socket |
| `pong` | none | request socket |
| `error` | `{ message }` | request socket |
| `update:status` | desktop update status | app-specific |
| `agent.started` | `{ kombuseSessionId, ticketId?, agentName?, startedAt? }` | `session:{id}` + origin socket + `*` |
| `agent.event` | `{ kombuseSessionId, event }` | `session:{id}` + origin socket |
| `agent.complete` | `{ kombuseSessionId, backendSessionId?, ticketId?, status?, reason?, errorMessage? }` | `session:{id}` + origin socket + `*` |
| `agent.permission_pending` | `{ sessionId, requestId, toolName, input, description?, ticketId? }` | `session:{id}` + `*` |
| `agent.permission_resolved` | `{ sessionId, requestId }` | `session:{id}` + `*` |
| `ticket.agent_status` | `{ ticketId, status, sessionCount }` derived status snapshot | `*` |

## Lifecycle Stream Rules

### Agent stream semantics

- `agent.started` is emitted when a session turn starts.
- `agent.event` streams serialized backend events (`message`, `tool_use`, `tool_result`, `permission_request`, `raw`, `error`).
- `permission_response` exists in the serialized event union, but current server producers do not emit it on `agent.event`.
- Backend `complete` events are **not** sent as `agent.event`; completion is represented by `agent.complete`.
- `agent.complete.status` can be `completed`, `failed`, `aborted`, or `stopped`.

### Permission semantics

- `permission_request` backend events are converted into `agent.permission_pending` broadcasts.
- Client approval/denial arrives as `permission.response`.
- The server forwards the decision to the backend and then broadcasts `agent.permission_resolved`.
- Manual permission responses persist `session_events(event_type='permission_response')`; auto-approved responses broadcast `agent.permission_resolved` without persisting `permission_response`.

### Ticket status indicator semantics

- `ticket.agent_status` is computed and broadcast from server state.
- Current producers are `trigger-orchestrator.ts` and `backend-registry.ts`.
- It is derived from persisted `sessions` status plus live backend registry state.
- User `/ws` successful completion path does not emit `ticket.agent_status` directly.
- It is not a standalone persisted WebSocket record.

## Routing and Broadcast Behavior

Primary files:
- `apps/server/src/websocket/routes.ts`
- `apps/server/src/websocket/hub.ts`
- `apps/server/src/websocket/broadcaster.ts`
- `apps/server/src/websocket/serialize-agent-event.ts`

Behavior summary:
- Domain events (`type: 'event'`) are broadcast based on event fields:
  - `project:{project_id}` if present
  - `ticket:{ticket_id}` if present
  - plus wildcard subscribers (`*`)
- Agent lifecycle messages use `broadcastAgentMessage(...)`:
  - always to `session:{kombuseSessionId}`
  - plus `originSocket` for user-initiated invocations
  - optionally plus wildcard (`agent.started`, `agent.complete`)
- `ticket.agent_status` messages are emitted by trigger/orphan/cleanup/status-computation paths, not by the normal user `/ws` success completion callback.
- `agent.stop`:
  - if an active backend exists, the server issues stop and immediately broadcasts `agent.complete` with `status: 'aborted'`, `reason: 'user_stop'`
  - if no active backend exists, server responds with `error`

## Example Flow (User Invocation)

```text
Client -> /ws: agent.invoke
/ws -> chat-session-runner: startAgentChatSession
runner -> session:{id} + origin: agent.started
runner -> session:{id} + origin: agent.event (stream)
runner -> session:{id} + origin + *: agent.complete
trigger/backend-registry paths -> *: ticket.agent_status (when applicable)
```

## Client Integration Notes

- `WebSocketProvider` manages one shared socket and topic registration.
- `useWebSocket` registers per-hook topics against the shared provider.
- `AppProvider` subscribes to `*` and updates:
  - active sessions (`agent.started`, `agent.complete`)
  - pending permission queue (`agent.permission_pending`, `agent.permission_resolved`)
  - ticket activity indicator (`ticket.agent_status`)
