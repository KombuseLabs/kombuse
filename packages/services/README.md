# @kombuse/services

Business logic services for REST API and MCP handlers.

## Installation

This package is internal to the monorepo. Import services in your app:

```typescript
import { ticketService, agentService } from '@kombuse/services'
```

## Services

### TicketService

Handles ticket CRUD operations with business logic validation.

```typescript
import { ticketService } from '@kombuse/services'

// List tickets with filters
const tickets = ticketService.list({ status: 'open', project_id: '1' })

// Get a single ticket
const ticket = ticketService.get(123)

// Create a ticket
const newTicket = ticketService.create({
  project_id: '1',
  author_id: 'user-1',
  title: 'Bug report',
  body: 'Description...',
})

// Update a ticket
const updated = ticketService.update(123, { status: 'in_progress' })

// Delete a ticket
ticketService.delete(123)

// Claim/unclaim tickets
const result = ticketService.claim({ ticketId: 123, claimerId: 'user-1' })
ticketService.unclaim(123, 'user-1')
ticketService.extendClaim(123, 30) // Extend by 30 minutes
```

### AgentService

Manages AI agents, triggers, and invocations with permission checking.

```typescript
import { agentService } from '@kombuse/services'

// Create an agent (profile must exist with type='agent')
const agent = agentService.createAgent({
  id: 'agent-reviewer',
  system_prompt: 'You review tickets for completeness...',
  permissions: [
    { type: 'resource', resource: 'ticket.*', actions: ['read'], scope: 'invocation' },
    { type: 'resource', resource: 'comment', actions: ['create'], scope: 'invocation' },
    { type: 'tool', tool: 'mcp__kombuse__*', scope: 'invocation' },
  ],
  config: {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
  },
})

// Create a trigger
const trigger = agentService.createTrigger({
  agent_id: 'agent-reviewer',
  event_type: 'ticket.created',
  conditions: { status: 'open' }, // Optional: filter by event payload
  priority: 10,
})

// Process an event - finds matching triggers and creates invocations
const invocations = agentService.processEvent(event)

// Invocations are executed by the agent-execution-service using startAgentChatSession
// This ensures consistent persistence, streaming, and permission handling
```

## Agent Permissions

Agents have fine-grained permissions using glob patterns:

### Resource Permissions

```typescript
{
  type: 'resource',
  resource: 'ticket.*',      // Pattern: 'ticket', 'ticket.body', '*'
  actions: ['read', 'create'], // 'read' | 'create' | 'update' | 'delete' | '*'
  scope: 'invocation',       // 'invocation' | 'project' | 'global'
}
```

### Tool Permissions

```typescript
{
  type: 'tool',
  tool: 'mcp__kombuse__*',   // Pattern matches MCP tool names
  scope: 'invocation',
}
```

### Scopes

| Scope | Description |
|-------|-------------|
| `invocation` | Only resources related to the triggering event |
| `project` | All resources in the event's project |
| `global` | All resources (use carefully) |

## Integrating with Events

Hook into the event system to automatically trigger agents:

```typescript
import { onEventCreated } from '@kombuse/persistence'
import { agentService } from '@kombuse/services'
import { processEventAndRunAgents } from '@kombuse/server/services/agent-execution-service'

// Subscribe to all events
onEventCreated((event) => {
  // Process event: finds matching triggers, creates invocations, and runs agents
  // via the unified chat infrastructure (with persistence, streaming, permissions)
  processEventAndRunAgents(event).catch(console.error)
})
```

## Directory Structure

```
src/
├── index.ts              - Exports all services
├── ticket-service.ts     - Ticket operations
└── agent-service.ts      - Agent, trigger, invocation management
```

## Exports

```typescript
// Services
export { TicketService, ticketService } from '@kombuse/services'
export { AgentService, agentService } from '@kombuse/services'

// Types
export type { ITicketService } from '@kombuse/services'
export type {
  IAgentService,
  PermissionContext,
  PermissionCheckRequest,
  PermissionCheckResult,
  TriggerMatchResult,
} from '@kombuse/services'
```
