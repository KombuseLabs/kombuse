# Database Schema

Kombuse uses SQLite for persistence, designed for a ticket system where both users and AI agents can create and interact with tickets.

## Design Principles

1. **Unified Actor Model**: Users and agents share a single `profiles` table with a type discriminator, enabling consistent ownership and activity tracking
2. **Event-Driven Observability**: All changes are logged to an `events` table, allowing external systems to poll and trigger agent actions
3. **Chat-Like Threading**: Comments use `parent_id` for reply chains, creating a conversational feel rather than forum-style threads
4. **External Sync Support**: Tickets and comments can be imported from GitHub, Jira, or GitLab via `external_source` and `external_id` fields
5. **Robust Assignment Tracking**: Assignments (`assignee_id`) and active claims (`claimed_by_id`) are tracked separately with timestamps and optional expiration
6. **Extensible Agent System**: Agents extend profiles with configuration, triggers, and permissions stored as flexible JSON for easy iteration
7. **Profile-Scoped Settings**: User and agent preferences can be stored as profile-level key-value settings

## Entity Relationships

```
profiles (users & agents)
    ├── owns → projects
    ├── configures → profile_settings
    ├── authors → tickets, comments
    ├── assigned → tickets
    ├── claims → tickets
    ├── mentioned in → mentions
    ├── subscribes to → event_subscriptions
    ├── triggers → events
    └── extends to → agents (for type='agent')

projects
    ├── contains → tickets, labels
    ├── scopes → events, event_subscriptions
    └── scopes → agent_triggers

tickets
    ├── has → comments, labels, attachments
    ├── mentioned in → mentions
    └── generates → events

comments
    ├── has → mentions, attachments
    ├── replies to → comments (via parent_id)
    └── generates → events

agents (extends profiles)
    ├── has → agent_triggers
    └── has → agent_invocations

agent_invocations
    ├── references → agent_triggers
    ├── references → events
    └── references → sessions

sessions
    └── has → session_events
```

## Tables

### profiles

Unified table for users and agents. The `type` field discriminates between them.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID identifier |
| type | TEXT | `'user'` or `'agent'` |
| name | TEXT | Display name |
| email | TEXT | Email (unique, null for agents) |
| description | TEXT | Bio or agent description |
| avatar_url | TEXT | Profile image URL |
| external_source | TEXT | `'github'`, `'gitlab'`, etc. |
| external_id | TEXT | ID in external system |
| is_active | INTEGER | 1 = active, 0 = deactivated |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Why unified?** Foreign keys like `author_id` or `actor_id` can reference either users or agents without nullable columns or union types.

### profile_settings

Per-profile key-value settings (preferences, defaults, feature flags).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| profile_id | TEXT FK | References profiles(id) |
| setting_key | TEXT | Setting key (unique per profile) |
| setting_value | TEXT | Setting value as string/JSON text |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Unique constraint**: `(profile_id, setting_key)` enables upsert semantics per profile.

### projects

Container for tickets. Can be linked to a local path or a remote repository.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID or slug |
| name | TEXT | Project name |
| description | TEXT | Project description |
| owner_id | TEXT FK | References profiles(id) |
| local_path | TEXT | Filesystem path (mutually exclusive with repo) |
| repo_source | TEXT | `'github'`, `'gitlab'`, `'bitbucket'` |
| repo_owner | TEXT | e.g., `'octocat'` |
| repo_name | TEXT | e.g., `'hello-world'` |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### labels

Per-project labels for categorizing tickets.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| project_id | TEXT FK | References projects(id) |
| name | TEXT | Label name (not unique) |
| color | TEXT | Hex color, e.g., `'#ff0000'` |
| description | TEXT | Label description |
| created_at | TEXT | ISO timestamp |

### tickets

Core issue/ticket entity with assignment tracking for conflict prevention.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| project_id | TEXT FK | References projects(id) |
| author_id | TEXT FK | Who created it (user or agent) |
| assignee_id | TEXT FK | Who's responsible (nullable) |
| claimed_by_id | TEXT FK | Who currently holds the claim (nullable) |
| title | TEXT | Ticket title |
| body | TEXT | Markdown body |
| status | TEXT | `'open'`, `'closed'`, `'in_progress'`, `'blocked'` |
| priority | INTEGER | 0-4 (0 = lowest, 4 = critical) |
| claimed_at | TEXT | When the ticket was claimed by `claimed_by_id` |
| claim_expires_at | TEXT | Optional expiration for stale claim cleanup |
| external_source | TEXT | `'github'`, `'jira'`, etc. |
| external_id | TEXT | ID in external system |
| external_url | TEXT | Link to external ticket |
| synced_at | TEXT | Last sync timestamp |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Assignment Tracking**: `assignee_id` captures responsibility, while `claimed_by_id` + timestamps capture the active lease:
- Knowing who is responsible vs. who is actively working
- Optional time-limited claims for agents (prevents stale claims)
- Queries for expired claims that need reassignment

### ticket_labels

Many-to-many junction for tickets and labels.

| Column | Type | Description |
|--------|------|-------------|
| ticket_id | INTEGER FK | References tickets(id) |
| label_id | INTEGER FK | References labels(id) |
| added_by_id | TEXT FK | Who added the label |
| created_at | TEXT | ISO timestamp |

### comments

Threaded comments on tickets.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| ticket_id | INTEGER FK | References tickets(id) |
| author_id | TEXT FK | Who wrote it |
| parent_id | INTEGER FK | Reply to another comment (nullable) |
| body | TEXT | Markdown content |
| is_edited | INTEGER | 1 if edited after creation |
| external_source | TEXT | If imported |
| external_id | TEXT | ID in external system |
| synced_at | TEXT | Last sync timestamp |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Threading**: Use `parent_id` to create reply chains. Query all comments for a ticket ordered by `created_at` to display chronologically.

### mentions

Tracks mentions in comments for both profiles (`@name`) and tickets (`#123`).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| comment_id | INTEGER FK | References comments(id) |
| mention_type | TEXT | `'profile'` or `'ticket'` |
| mentioned_profile_id | TEXT FK | Target profile when `mention_type='profile'` |
| mentioned_ticket_id | INTEGER FK | Target ticket when `mention_type='ticket'` |
| mention_text | TEXT | Original text, e.g., `'@claude'` or `'#42'` |
| created_at | TEXT | ISO timestamp |

**Integrity**: A CHECK constraint enforces exactly one target column is set based on `mention_type`.

**Usage**: On comment create/update, parse for `@profile` and `#ticketId` patterns. Unknown profiles/tickets are ignored.

### attachments

Files attached to comments or tickets.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| comment_id | INTEGER FK | Attached to comment (XOR with ticket_id) |
| ticket_id | INTEGER FK | Attached to ticket (XOR with comment_id) |
| filename | TEXT | Original filename |
| mime_type | TEXT | e.g., `'image/png'` |
| size_bytes | INTEGER | File size |
| storage_path | TEXT | Path to stored file |
| uploaded_by_id | TEXT FK | Who uploaded it |
| created_at | TEXT | ISO timestamp |

**Note**: A CHECK constraint ensures exactly one of `comment_id` or `ticket_id` is set.

### events

Activity log for observability and agent triggering.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| event_type | TEXT | e.g., `'ticket.created'`, `'comment.added'` |
| project_id | TEXT FK | Context: which project |
| ticket_id | INTEGER FK | Context: which ticket |
| comment_id | INTEGER FK | Context: which comment |
| actor_id | TEXT FK | Who triggered it |
| actor_type | TEXT | `'user'`, `'agent'`, `'system'` |
| payload | TEXT | JSON with event-specific data |
| created_at | TEXT | ISO timestamp |

### event_subscriptions

Tracks which events each subscriber (agent) has processed. Enables reliable event consumption without reprocessing.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| subscriber_id | TEXT FK | References profiles(id) - the agent |
| event_type | TEXT | Event type to subscribe to |
| project_id | TEXT FK | Optional: scope to specific project |
| last_processed_event_id | INTEGER | Last event ID this subscriber processed |
| created_at | TEXT | ISO timestamp |

**Unique constraint**: `(subscriber_id, event_type, project_id)` - one subscription per agent per event type per project.

**Usage**: Agents query for events with `id > last_processed_event_id`, process them, then update `last_processed_event_id`. This ensures exactly-once processing without time-based polling gaps.

### sessions

Stores durable lifecycle state for an agent chat session (`kombuse_session_id`).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID identifier |
| kombuse_session_id | TEXT | Optional app-level session reference |
| backend_type | TEXT | Backend identifier (e.g. claude-code, sdk) |
| backend_session_id | TEXT | Backend-native session/conversation ID |
| ticket_id | INTEGER FK | Optional ticket linkage |
| agent_id | TEXT FK | Optional owning agent profile |
| status | TEXT | `'pending'`, `'running'`, `'completed'`, `'failed'`, `'aborted'`, `'stopped'` |
| metadata | TEXT | JSON metadata (`SessionMetadata`) including terminal diagnostics and workflow fields |
| started_at | TEXT | Session start timestamp |
| completed_at | TEXT | Set when status transitions to `completed`; null otherwise |
| failed_at | TEXT | Set when status transitions to `failed` or `aborted`; null otherwise |
| aborted_at | TEXT | Set when status transitions to `aborted`; null for non-aborted states |
| last_event_seq | INTEGER | Last persisted event sequence number |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

Status/timestamp semantics in current implementation:

- `pending`: newly ensured session before active run transition
- `running`: active turn/session
- `completed`: successful completion (`completed_at` set; `failed_at`/`aborted_at` cleared)
- `failed`: terminal failure (`failed_at` set; `completed_at`/`aborted_at` cleared)
- `aborted`: forced/user/system abort (`failed_at` and `aborted_at` set)
- `stopped`: idle-timeout stop from `completed` (`status` changes to `stopped`)

Primary write paths:

- Transition orchestration: `packages/services/src/session-state-machine.ts`
- Persistence writes: `packages/services/src/session-persistence-service.ts`
- Orphan/startup/shutdown cleanup fallback: `apps/server/src/services/agent-execution-service/backend-registry.ts`

### session_events

Append-only event stream for each session turn.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| session_id | TEXT FK | References sessions(id) |
| seq | INTEGER | Monotonic event sequence in the session |
| event_type | TEXT | Serialized event kind |
| payload | TEXT | JSON payload |
| created_at | TEXT | ISO timestamp |

**Constraint**: `UNIQUE(session_id, seq)` prevents duplicate sequence entries.

Current producers:

- Backend stream events persisted by `SessionPersistenceService.persistEvent(...)` (`message`, `tool_use`, `tool_result`, `permission_request`, `raw`, `error`)
- Permission decisions persisted by `permission-service.ts` as `permission_response`

`sessions.last_event_seq` is updated on each persisted event insert.

### agents

Extends profiles with agent-specific configuration. One-to-one relationship with profiles where `type='agent'`.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK/FK | References profiles(id) |
| system_prompt | TEXT | The agent's system prompt |
| permissions | TEXT | JSON array of permission rules |
| config | TEXT | JSON object for model/behavior settings |
| is_enabled | INTEGER | 1 = active, 0 = disabled |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Permissions JSON**: Array of permission rules with glob pattern support:

```json
[
  { "type": "resource", "resource": "ticket.*", "actions": ["read"], "scope": "invocation" },
  { "type": "resource", "resource": "comment", "actions": ["create", "read"], "scope": "invocation" },
  { "type": "tool", "tool": "mcp__kombuse__*", "scope": "invocation" }
]
```

**Config JSON**: Flexible model and behavior settings:

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "temperature": 0.3,
  "anthropic": { "thinking": true },
  "retry_on_failure": true
}
```

### agent_triggers

Defines when agents should be invoked based on events.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| agent_id | TEXT FK | References agents(id) |
| event_type | TEXT | e.g., `'ticket.created'`, `'comment.added'` |
| project_id | TEXT FK | Optional: scope to specific project |
| conditions | TEXT | JSON filter conditions (optional) |
| is_enabled | INTEGER | 1 = active, 0 = disabled |
| priority | INTEGER | Higher = runs first when multiple match |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Conditions**: Simple JSON field matching against event payload:

```json
{ "status": "open", "priority": 4 }
```

### agent_invocations

Tracks trigger-driven invocation lifecycle and retry metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment ID |
| agent_id | TEXT FK | References agents(id) |
| trigger_id | INTEGER FK | References agent_triggers(id) |
| event_id | INTEGER FK | References events(id) |
| session_id | TEXT FK | References sessions(id) |
| kombuse_session_id | TEXT | App-level session identifier for stream correlation |
| status | TEXT | `'pending'`, `'running'`, `'completed'`, `'failed'` |
| attempts | INTEGER | Current attempt count |
| max_attempts | INTEGER | Retry cap |
| run_at | TEXT | Earliest eligible execution time |
| context | TEXT | JSON invocation context |
| result | TEXT | JSON outcome/error info |
| error | TEXT | Last error message |
| started_at | TEXT | When execution began |
| completed_at | TEXT | When execution finished |
| created_at | TEXT | ISO timestamp |

**Context JSON**: Stores the triggering context:

```json
{
  "event_id": 42,
  "event_type": "ticket.created",
  "project_id": "proj-1",
  "ticket_id": 123
}
```

**Result JSON**: Stores the outcome:

```json
{ "comment_id": 456, "message": "Review completed" }
```

Or on failure:

```json
{ "error": "Permission denied", "code": "PERMISSION_ERROR" }
```

#### Lifecycle ownership: `sessions.status` vs `agent_invocations.status`

- `sessions.status` is the durable chat/session lifecycle plane.
  - Written by `SessionStateMachine`/`SessionPersistenceService` in chat execution paths and cleanup routines.
  - Represents session runtime state (`pending/running/completed/failed/aborted/stopped`) and terminal diagnostics metadata.

- `agent_invocations.status` is the trigger scheduler/audit plane.
  - Written primarily by `trigger-orchestrator.ts` (`pending -> running -> completed|failed`) and invocation callbacks in `agent-execution-service/index.ts`.
  - Represents invocation scheduling/execution status, not full chat lifecycle state.

- The two status planes are related but intentionally distinct:
  - a single session can outlive one invocation
  - invocation failures can occur while session metadata still carries broader lifecycle context

## Event Types

| Event | Payload Example |
|-------|-----------------|
| `ticket.created` | `{"ticket_id": 1, "title": "Bug report"}` |
| `ticket.updated` | `{"ticket_id": 1, "changes": {"status": ["open", "closed"]}}` |
| `ticket.closed` | `{"ticket_id": 1, "closed_by": "user-123"}` |
| `ticket.claimed` | `{"ticket_id": 1, "claimed_by_id": "agent-456", "expires_at": null}` |
| `ticket.unclaimed` | `{"ticket_id": 1, "previous_claimed_by": "agent-456"}` |
| `comment.added` | `{"comment_id": 5, "ticket_id": 1, "author_id": "agent-456"}` |
| `label.added` | `{"ticket_id": 1, "label_id": 3, "added_by": "user-123"}` |
| `mention.created` | `{"comment_id": 5, "mentioned_id": "agent-456"}` |

## Examples

### Create a user and agent

```sql
-- Create a user
INSERT INTO profiles (id, type, name, email)
VALUES ('user-1', 'user', 'Alice', 'alice@example.com');

-- Create an agent
INSERT INTO profiles (id, type, name, description)
VALUES ('agent-claude', 'agent', 'Claude', 'AI assistant for bug triage');
```

### Create a project with a local path

```sql
INSERT INTO projects (id, name, owner_id, local_path)
VALUES ('proj-1', 'My App', 'user-1', '/Users/alice/projects/my-app');
```

### Create a project linked to GitHub

```sql
INSERT INTO projects (id, name, owner_id, repo_source, repo_owner, repo_name)
VALUES ('proj-2', 'Open Source Lib', 'user-1', 'github', 'alice', 'my-lib');
```

### Create a ticket

```sql
INSERT INTO tickets (project_id, author_id, title, body, status, priority)
VALUES ('proj-1', 'user-1', 'Login button broken', 'Clicking login does nothing', 'open', 3);
```

### Agent claims a ticket

```sql
-- Claim a ticket with 30-minute expiration
UPDATE tickets
SET claimed_by_id = 'agent-claude',
    claimed_at = datetime('now'),
    claim_expires_at = datetime('now', '+30 minutes'),
    assignee_id = COALESCE(assignee_id, 'agent-claude'),
    updated_at = datetime('now')
WHERE id = 1
  AND (claimed_by_id IS NULL OR claim_expires_at < datetime('now'))
  AND (assignee_id IS NULL OR assignee_id = 'agent-claude');

-- Log the claim event
INSERT INTO events (event_type, project_id, ticket_id, actor_id, actor_type, payload)
VALUES (
  'ticket.claimed',
  'proj-1',
  1,
  'agent-claude',
  'agent',
  '{"ticket_id": 1, "claimed_by_id": "agent-claude", "expires_at": "2024-01-15T10:30:00Z"}'
);
```

### Agent releases a claim

```sql
-- Unclaim when done or giving up
UPDATE tickets
SET claimed_by_id = NULL,
    claimed_at = NULL,
    claim_expires_at = NULL,
    updated_at = datetime('now')
WHERE id = 1;

-- Log the unclaim event
INSERT INTO events (event_type, project_id, ticket_id, actor_id, actor_type, payload)
VALUES (
  'ticket.unclaimed',
  'proj-1',
  1,
  'agent-claude',
  'agent',
  '{"ticket_id": 1, "previous_claimed_by": "agent-claude"}'
);
```

### Add a comment with a mention

```sql
-- Add comment
INSERT INTO comments (ticket_id, author_id, body)
VALUES (1, 'user-1', 'Hey @claude can you look at this?');

-- Record the mention (parsed from body)
INSERT INTO mentions (comment_id, mentioned_id, mention_text)
VALUES (1, 'agent-claude', '@claude');

-- Log the event
INSERT INTO events (event_type, project_id, ticket_id, comment_id, actor_id, actor_type, payload)
VALUES (
  'mention.created',
  'proj-1',
  1,
  1,
  'user-1',
  'user',
  '{"mentioned_id": "agent-claude"}'
);
```

### Agent responds to a ticket

```sql
-- Agent adds a comment
INSERT INTO comments (ticket_id, author_id, body)
VALUES (1, 'agent-claude', 'I analyzed the code. The issue is in `LoginButton.tsx` line 42.');

-- Log the event
INSERT INTO events (event_type, project_id, ticket_id, comment_id, actor_id, actor_type, payload)
VALUES (
  'comment.added',
  'proj-1',
  1,
  2,
  'agent-claude',
  'agent',
  '{"comment_id": 2, "ticket_id": 1}'
);
```

### Query: Get tickets with labels

```sql
SELECT
  t.id, t.title, t.status,
  GROUP_CONCAT(l.name, ', ') AS labels
FROM tickets t
LEFT JOIN ticket_labels tl ON t.id = tl.ticket_id
LEFT JOIN labels l ON tl.label_id = l.id
WHERE t.project_id = 'proj-1'
GROUP BY t.id
ORDER BY t.created_at DESC;
```

### Query: Get threaded comments

```sql
SELECT
  c.id,
  c.parent_id,
  c.body,
  p.name AS author_name,
  p.type AS author_type
FROM comments c
JOIN profiles p ON c.author_id = p.id
WHERE c.ticket_id = 1
ORDER BY c.created_at ASC;
```

### Query: Find unclaimed tickets for agent self-assignment

```sql
SELECT * FROM tickets
WHERE project_id = 'proj-1'
  AND status = 'open'
  AND claimed_by_id IS NULL
  AND (assignee_id IS NULL OR assignee_id = 'agent-claude')
ORDER BY priority DESC, created_at ASC;
```

### Query: Find tickets with expired claims

```sql
SELECT * FROM tickets
WHERE claimed_by_id IS NOT NULL
  AND claim_expires_at IS NOT NULL
  AND claim_expires_at < datetime('now')
ORDER BY claim_expires_at ASC;
```

### Event subscription: Agent subscribes to events

```sql
-- Subscribe to ticket.created events in a project
INSERT INTO event_subscriptions (subscriber_id, event_type, project_id)
VALUES ('agent-claude', 'ticket.created', 'proj-1');

-- Subscribe to all mention events (no project filter)
INSERT INTO event_subscriptions (subscriber_id, event_type, project_id)
VALUES ('agent-claude', 'mention.created', NULL);
```

### Query: Get unprocessed events for an agent

```sql
-- Get events the agent hasn't processed yet
SELECT e.*
FROM events e
JOIN event_subscriptions es ON (
  es.event_type = e.event_type
  AND (es.project_id IS NULL OR es.project_id = e.project_id)
)
WHERE es.subscriber_id = 'agent-claude'
  AND (es.last_processed_event_id IS NULL OR e.id > es.last_processed_event_id)
ORDER BY e.id ASC;
```

### Update subscription after processing

```sql
-- Mark events as processed (update to latest event ID)
UPDATE event_subscriptions
SET last_processed_event_id = 42
WHERE subscriber_id = 'agent-claude'
  AND event_type = 'ticket.created'
  AND project_id = 'proj-1';
```

### Create an agent with triggers

```sql
-- First, create the agent profile
INSERT INTO profiles (id, type, name, description)
VALUES ('agent-reviewer', 'agent', 'Ticket Reviewer', 'Reviews new tickets for completeness');

-- Then create the agent configuration
INSERT INTO agents (id, system_prompt, permissions, config)
VALUES (
  'agent-reviewer',
  'You are a ticket reviewer. Analyze tickets for completeness and clarity.',
  '[
    {"type": "resource", "resource": "ticket.*", "actions": ["read"], "scope": "invocation"},
    {"type": "resource", "resource": "comment", "actions": ["create", "read"], "scope": "invocation"},
    {"type": "tool", "tool": "mcp__kombuse__*", "scope": "invocation"}
  ]',
  '{"model": "claude-sonnet-4-20250514", "max_tokens": 4096}'
);

-- Add a trigger for new tickets
INSERT INTO agent_triggers (agent_id, event_type, priority)
VALUES ('agent-reviewer', 'ticket.created', 10);

-- Add a trigger for mentions (scoped to a project)
INSERT INTO agent_triggers (agent_id, event_type, project_id, priority)
VALUES ('agent-reviewer', 'mention.created', 'proj-1', 5);
```

### Create an agent invocation

```sql
-- Create a session for the invocation
INSERT INTO sessions (id) VALUES ('session-abc123');

-- Create the invocation record
INSERT INTO agent_invocations (agent_id, trigger_id, event_id, session_id, context)
VALUES (
  'agent-reviewer',
  1,
  42,
  'session-abc123',
  '{"event_id": 42, "event_type": "ticket.created", "project_id": "proj-1", "ticket_id": 123}'
);

-- Update status when agent starts running
UPDATE agent_invocations
SET status = 'running', started_at = datetime('now')
WHERE id = 1;

-- Update status when agent completes
UPDATE agent_invocations
SET status = 'completed',
    result = '{"comment_id": 456, "message": "Review completed"}',
    completed_at = datetime('now')
WHERE id = 1;
```

### Query: Find matching triggers for an event

```sql
SELECT t.*, a.system_prompt, a.config
FROM agent_triggers t
JOIN agents a ON t.agent_id = a.id
WHERE t.event_type = 'ticket.created'
  AND t.is_enabled = 1
  AND a.is_enabled = 1
  AND (t.project_id IS NULL OR t.project_id = 'proj-1')
ORDER BY t.priority DESC;
```

### Query: Get agent invocation history

```sql
SELECT
  i.id,
  i.status,
  i.created_at,
  i.completed_at,
  a.id AS agent_name,
  t.event_type,
  i.result
FROM agent_invocations i
JOIN agents a ON i.agent_id = a.id
JOIN agent_triggers t ON i.trigger_id = t.id
WHERE i.agent_id = 'agent-reviewer'
ORDER BY i.created_at DESC
LIMIT 20;
```

### Query: Find failed invocations for retry

```sql
SELECT i.*, a.system_prompt, a.config
FROM agent_invocations i
JOIN agents a ON i.agent_id = a.id
WHERE i.status = 'failed'
  AND a.is_enabled = 1
ORDER BY i.created_at DESC;
```

## Migration Strategy

Migrations are stored in `packages/persistence/src/database.ts` and tracked in the `migrations` table. Each migration has a unique name and SQL to execute.

To add a new migration:

1. Add entry to the `migrations` array in `database.ts`
2. Give it a sequential name like `012_add_feature`
3. The migration runs automatically on database initialization

Migrations are idempotent - running them multiple times is safe.

Current migrations:
- `001_create_core_tables` - Core schema (tickets, comments, events, agents, sessions, invocations)
- `002_invocation_kombuse_session_id` - Adds `agent_invocations.kombuse_session_id`
- `003_session_ticket_id` - Adds `sessions.ticket_id`
- `004_comment_kombuse_session_id` - Adds `comments.kombuse_session_id`
- `005_event_kombuse_session_id` - Adds `events.kombuse_session_id`
- `006_ticket_opened_closed_at` - Adds ticket open/close timestamps
- `007_ticket_last_activity_at` - Adds ticket activity timestamp
- `008_reply_threads` - Adds comment reply threading metadata
- `009_mentions_ticket_support` - Adds ticket mention support
- `010_profile_settings` - Adds profile settings table
- `011_trigger_conditions` - Trigger condition improvements
- `012_session_backend_type` - Session backend typing improvements
- `013_event_comments_fts` - FTS index for comments
- `014_session_agent_id` - Adds `sessions.agent_id`
- `015_milestones` - Milestones and ticket milestone linkage
- `016_session_state_machine` - Recreates `sessions` for state-machine statuses + metadata
- `017_ticket_triggers_enabled` - Adds per-ticket trigger enable/disable flag
- `018_session_abort_diagnostics` - Adds `sessions.aborted_at` and terminal diagnostics backfill
