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

Server runs on **http://localhost:3332**

## API Endpoints

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Create ticket |
| GET | `/api/tickets/:id` | Get ticket with activities |
| PATCH | `/api/tickets/:id` | Update ticket |
| DELETE | `/api/tickets/:id` | Delete ticket |

### Query Parameters (GET /api/tickets)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `open` \| `closed` \| `in_progress` | Filter by status |
| `priority` | `0-4` | Filter by priority |
| `project_id` | `string` | Filter by project |
| `search` | `string` | Search in title and body |
| `limit` | `number` | Max results (default: 100) |
| `offset` | `number` | Pagination offset |

### Create/Update Ticket Body

```json
{
  "title": "string (required)",
  "body": "string",
  "status": "open | closed | in_progress",
  "priority": 0-4,
  "project_id": "string",
  "github_id": "number",
  "repo_name": "string"
}
```

## Structure

```
src/
├── index.ts          # Server entry point
├── routes/
│   ├── index.ts      # Route exports
│   └── tickets.ts    # Ticket CRUD routes
└── schemas/
    └── tickets.ts    # Zod validation schemas
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
