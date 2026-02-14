# Agent Lifecycle Architecture

This document is the canonical lifecycle spec for agent execution in Kombuse.

Scope:
- Agent backend process lifecycle (emitted/listened events)
- Persisted lifecycle state in `sessions`, `session_events`, and `agent_invocations`
- WebSocket lifecycle stream (`agent.started`, `agent.event`, `agent.complete`, permission events, `ticket.agent_status`)

## Lifecycle State Planes

| Plane | Owner | Purpose | Persisted storage |
|------|-------|---------|-------------------|
| Backend process lifecycle | `AgentBackend` implementations + `activeBackends` runtime map | Live process state and streamed tool/message events | Not directly persisted as a single state; stream events go to `session_events` |
| Session lifecycle | `SessionStateMachine` + `SessionPersistenceService` | Durable chat session status and terminal metadata | `sessions` + `session_events` |
| Trigger invocation lifecycle | `trigger-orchestrator` + invocation updates | Scheduler/audit status for trigger runs | `agent_invocations` (+ audit events in `events`) |

## Session State Machine (Canonical)

Source of truth: `packages/services/src/session-state-machine.ts`.

### Transition Matrix

`—` means invalid transition.

| From state | `start` | `complete` | `fail` | `abort` | `stop` | `continue` |
|------------|---------|------------|--------|---------|--------|------------|
| `pending` | `running` | — | — | `aborted` | — | — |
| `running` | — | `completed` | `failed` | `aborted` | — | `running` |
| `completed` | — | — | — | — | `stopped` | `running` |
| `failed` | — | — | — | — | — | `running` |
| `aborted` | — | — | — | — | — | — |
| `stopped` | — | — | — | — | — | `running` |

### Mermaid State Diagram

```mermaid
stateDiagram-v2
    [*] --> pending

    pending --> running: start
    pending --> aborted: abort

    running --> completed: complete
    running --> failed: fail
    running --> aborted: abort
    running --> running: continue

    completed --> stopped: stop
    completed --> running: continue

    failed --> running: continue
    stopped --> running: continue

    aborted --> [*]
```

### ASCII State Diagram

```text
                         +--------------------- continue ----------------------+
                         |                                                     |
[pending] --start--> [running] --complete--> [completed] --stop--> [stopped] |
    |                   |  ^                    |  ^                           |
    |                   |  |                    |  +-------- continue ---------+
    |                   |  +------ continue ----+
    |                   +--fail--> [failed] --continue-------------------------+
    +------abort--------------------------------------------------> [aborted]

[aborted] has no outbound transitions.
```

## Sequence: User-Initiated WebSocket Flow

### Mermaid

```mermaid
sequenceDiagram
    participant Client as Browser Client
    participant WS as /ws route
    participant Runner as chat-session-runner
    participant SM as SessionStateMachine
    participant Persist as SessionPersistenceService
    participant Backend as AgentBackend
    participant Perm as permission-service
    participant Hub as wsHub
    participant DB as SQLite (sessions/session_events)

    Client->>WS: { type: "agent.invoke", ... }
    WS->>Runner: startAgentChatSession(...)
    Runner->>Persist: ensureSession(...)
    Runner->>SM: transition(start|continue)
    SM->>Persist: markSessionRunning/updateStatus...
    Runner->>Hub: agent.started (session + wildcard)
    Runner->>Backend: start()/send()

    loop Streamed backend events
        Backend-->>Runner: message/tool_use/tool_result/raw/error/permission_request
        Runner->>Persist: persistEvent(sessionId, event)
        Persist->>DB: INSERT session_events + UPDATE sessions.last_event_seq
        Runner->>Hub: agent.event

        alt permission_request requires manual approval
            Runner->>Perm: broadcastPermissionPending(...)
            Perm->>Hub: agent.permission_pending
            Client->>WS: { type: "permission.response", ... }
            WS->>Perm: respondToPermission(...)
            Perm->>Persist: persistEvent(permission_response)
            Perm->>Hub: agent.permission_resolved
        else permission_request auto-approved
            Runner->>Backend: respondToPermission(allow)
            Runner->>Hub: agent.permission_resolved
            Note over Runner,DB: Auto-approved permission responses are not persisted as permission_response rows.
        end
    end

    Backend-->>Runner: complete
    Runner->>SM: transition(complete|fail|abort)
    SM->>Persist: update sessions status/timestamps/metadata
    Runner->>Hub: agent.complete (session + wildcard)
    Note over Runner,Hub: User invoke success path does not emit ticket.agent_status.
    Note over Hub: ticket.agent_status is emitted by trigger-orchestrator and backend-registry paths.
```

### ASCII

```text
Client -> /ws -> chat-session-runner -> SessionStateMachine -> SessionPersistence -> DB
                                    \-> AgentBackend

1) agent.invoke enters /ws
2) runner ensures session + starts/continues state-machine lifecycle
3) runner emits agent.started
4) backend streams events
5) runner persists each stream event to session_events and emits agent.event
6) permission_request path:
   - manual approval: broadcast agent.permission_pending, receive permission.response, persist permission_response, broadcast agent.permission_resolved
   - auto-approve: broadcast agent.permission_resolved without persisting permission_response
7) backend completes
8) runner applies complete/fail/abort transition
9) runner emits agent.complete (user success path does not emit ticket.agent_status)
10) user `agent.stop` requests backend stop, and terminal `agent.complete` is emitted from the runner lifecycle path (not directly from `/ws`)
```

## Sequence: Trigger-Orchestrated Flow

### Mermaid

```mermaid
sequenceDiagram
    participant Bus as Event listener (onEventCreated)
    participant Trig as trigger-orchestrator
    participant Inv as agentInvocationsRepository
    participant Ev as eventsRepository
    participant Runner as chat-session-runner
    participant SM as SessionStateMachine
    participant Persist as SessionPersistenceService
    participant Hub as wsHub

    Bus->>Trig: processEventAndRunAgents(event)
    Trig->>Inv: update(status=running, attempts, started_at)
    Trig->>Ev: create(agent.started)
    Trig->>Runner: startAgentChatSession(... kombuseSessionId ...)
    Runner->>Persist: ensureSession(...)
    Runner->>SM: transition(start|continue)
    Runner->>Hub: agent.started

    loop backend stream
        Runner->>Persist: persistEvent(...)
        Runner->>Hub: agent.event
    end

    Runner-->>Trig: complete callback (status + reason)
    alt success
        Trig->>Inv: update(status=completed, completed_at)
        Trig->>Ev: create(agent.completed)
    else failed/aborted
        Trig->>Inv: update(status=failed, error, completed_at)
        Trig->>Ev: create(agent.failed)
    end
    Trig->>Hub: agent.complete
    Trig->>Hub: ticket.agent_status
```

### ASCII

```text
Event bus -> trigger-orchestrator
  -> agent_invocations.status = running
  -> events(agent.started)
  -> startAgentChatSession(...)
      -> sessions/session_events lifecycle (same runner path as user invoke)
  <- complete callback
  -> agent_invocations.status = completed|failed
  -> events(agent.completed|agent.failed)
  -> websocket agent.complete + ticket.agent_status
```

## Emitted / Listened / Persisted Mapping

### Backend Stream + Lifecycle Events

| Event | Emitted | Listened | Persisted | Storage location |
|------|---------|----------|-----------|------------------|
| `message` | Backend (`backend.subscribe`) | `chat-session-runner` | Yes | `session_events` row (`event_type='message'`), `sessions.last_event_seq` |
| `tool_use` | Backend | `chat-session-runner` | Yes | `session_events` (`event_type='tool_use'`), `sessions.last_event_seq` |
| `tool_result` | Backend | `chat-session-runner` | Yes | `session_events` (`event_type='tool_result'`), `sessions.last_event_seq` |
| `permission_request` | Backend | `chat-session-runner` (`handlePermissionRequest`) | Yes | `session_events` (`event_type='permission_request'`), `sessions.last_event_seq` |
| `permission_response` | `permission-service` when WS `permission.response` is handled | Backend via `respondToPermission(...)` + clients via `agent.permission_resolved` | Manual responses only | `session_events` (`event_type='permission_response'`) when resolved via WS `permission.response` |
| `raw` | Backend | `chat-session-runner` | Yes | `session_events` (`event_type='raw'`), `sessions.last_event_seq` |
| `error` | Backend | `chat-session-runner` | Yes | `session_events` (`event_type='error'`), plus `sessions.status='failed'` transition on terminal failure |
| `complete` | Backend | `chat-session-runner` completion handlers | Yes (via transition side effects, not as normal `session_events` row) | `sessions.status`, terminal timestamps (`completed_at` / `failed_at` / `aborted_at`), `sessions.backend_session_id`, optional `agent_invocations.status` update |
| `lifecycle` | Backend base class (`BaseAgentBackend`) | `chat-session-runner` (control flow only) | No | In-memory only; not serialized on `agent.event` and not persisted to `session_events` |

### WebSocket Lifecycle Messages

| Message | Emitted | Listened | Persisted | Storage location |
|---------|---------|----------|-----------|------------------|
| `agent.started` | `websocket/routes.ts` and `trigger-orchestrator.ts` | UI (`AppProvider`) and any `session:{id}` / `*` subscribers | Trigger path only | `events` (`event_type='agent.started'`) for trigger path; no dedicated websocket table |
| `agent.event` | `websocket/routes.ts` and `trigger-orchestrator.ts` | Session subscribers + origin socket | Indirectly yes | Underlying source events are in `session_events` |
| `agent.complete` | `websocket/routes.ts`, `trigger-orchestrator.ts`, `backend-registry.ts` | UI removes active session/pending permissions | Yes | `sessions` terminal status fields; trigger path also writes `agent_invocations` + `events` (`agent.completed`/`agent.failed`) |
| `agent.permission_pending` | `permission-service.ts` | UI permission queue + session/wildcard subscribers | Indirectly yes | Request event persisted in `session_events`; pending queue in runtime map (`serverPendingPermissions`) |
| `agent.permission_resolved` | `permission-service.ts` and `chat-session-runner.ts` (auto-approve path) | UI permission queue + session/wildcard subscribers | Manual responses only | `session_events` (`permission_response`) only for WS `permission.response`; auto-approved resolutions are broadcast without a row |
| `ticket.agent_status` | `backend-registry.ts` and `trigger-orchestrator.ts` | UI ticket status map | Derived only (no row) | Computed from `sessions` + in-memory `activeBackends`; broadcast only |

## Database Storage Map

| Database table | Stores | Main writers |
|----------------|--------|--------------|
| `sessions` | Durable session lifecycle (`status`, timestamps, metadata, backend ids) | `SessionStateMachine` via `SessionPersistenceService`, cleanup paths in `backend-registry` |
| `session_events` | Ordered event stream for a session (`seq`, `event_type`, `payload`) | `SessionPersistenceService.persistEvent(...)` from `chat-session-runner` and `permission-service` |
| `agent_invocations` | Trigger execution lifecycle (`pending/running/completed/failed`, attempts, errors) | `trigger-orchestrator`, plus state-machine invocation callbacks for continuation flows |
| `events` | Audit/timeline domain events (`agent.started`, `agent.completed`, `agent.failed`, ticket/comment events) | `trigger-orchestrator` (agent lifecycle domain events) and repository-level event creation |
