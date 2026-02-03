# Kombuse Server

Fastify REST API server with SQLite persistence.

## Quick Start

```bash
# Development (uses tsx for Node.js + TypeScript)
bun run dev

# Build
bun run build

# Production
bun run start
```

Server runs on **http://localhost:3331**

## API Endpoints

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Create ticket |
| GET | `/api/tickets/:id` | Get ticket with activities |
| PATCH | `/api/tickets/:id` | Update ticket |
| DELETE | `/api/tickets/:id` | Delete ticket |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/agents/:id` | Get agent |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |

### Agent Triggers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents/:agentId/triggers` | List triggers for agent |
| POST | `/api/agents/:agentId/triggers` | Create trigger for agent |
| GET | `/api/triggers/:id` | Get trigger |
| PATCH | `/api/triggers/:id` | Update trigger |
| DELETE | `/api/triggers/:id` | Delete trigger |

### Agent Invocations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invocations` | List invocations |
| GET | `/api/invocations/:id` | Get invocation |
| GET | `/api/agents/:agentId/invocations` | List invocations for agent |
| POST | `/api/agents/process-event` | Process event and create invocations |

### Query Parameters (GET /api/tickets)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `open` \| `closed` \| `in_progress` | Filter by status |
| `priority` | `0-4` | Filter by priority |
| `project_id` | `string` | Filter by project |
| `search` | `string` | Search in title and body |
| `limit` | `number` | Max results (default: 100) |
| `offset` | `number` | Pagination offset |

### Query Parameters (GET /api/agents)

| Parameter | Type | Description |
|-----------|------|-------------|
| `is_enabled` | `boolean` | Filter by enabled status |
| `limit` | `number` | Max results |
| `offset` | `number` | Pagination offset |

### Query Parameters (GET /api/invocations)

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | `string` | Filter by agent |
| `status` | `pending` \| `running` \| `completed` \| `failed` | Filter by status |
| `trigger_id` | `number` | Filter by trigger |
| `session_id` | `string` | Filter by session |
| `limit` | `number` | Max results |
| `offset` | `number` | Pagination offset |

## Structure

```
src/
├── index.ts          # Server entry point
├── routes/
│   ├── index.ts      # Route exports
│   ├── tickets.ts    # Ticket CRUD routes
│   ├── agents.ts     # Agent, trigger, invocation routes
│   └── ...           # Other routes
└── schemas/
    ├── tickets.ts    # Ticket validation schemas
    ├── agents.ts     # Agent validation schemas
    └── ...           # Other schemas
```

## Dependencies

- **Fastify** - Web framework
- **@fastify/cors** - CORS support
- **Zod** - Request validation
- **@kombuse/services** - Business logic
- **@kombuse/types** - Shared types

## Database

SQLite database stored at `~/.kombuse/data.db` (managed by `@kombuse/persistence`).

## Notes

- Uses `tsx` instead of Bun for runtime (better-sqlite3 compatibility)
- CORS enabled for `http://localhost:3333` (web app)
