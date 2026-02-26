# Testing Strategy

Test infrastructure for the Kombuse monorepo using Vitest.

## Quick Commands

```bash
bun run test                                # Run all tests via Turborepo
bun run test:watch                          # Watch mode (root)
bun run --filter @kombuse/persistence test  # Run specific package
```

## Principles

1. **Services are the primary test target** — unit tests without HTTP/React overhead
2. **Fast feedback** — in-memory SQLite, no external dependencies
3. **Agent-friendly output** — JSON reports for parsing test results
4. **Colocated tests** — tests live near the code they test

## Test Structure

```
packages/
  persistence/
    src/
      __tests__/              # Colocated unit tests
        database.test.ts
        tickets.test.ts
      test-utils.ts           # Exported test utilities
    vitest.config.ts          # Package-level config
    test-results.json         # JSON output (gitignored)

tests/
  fixtures/                   # Shared test data
    tickets.ts
```

## Test Utilities

Import from `@kombuse/persistence/test-utils`:

```typescript
import { createTestDatabase, createSeededDatabase, setupTestDb } from '@kombuse/persistence/test-utils'
```

### createTestDatabase()

Creates an in-memory SQLite database with migrations applied.

```typescript
const db = createTestDatabase()
// Use db directly for low-level tests
db.close()
```

### createSeededDatabase()

Creates an in-memory database with sample test data pre-populated.

```typescript
const db = createSeededDatabase()
// Database contains sample tickets in various states
```

### setupTestDb()

Sets up database with dependency injection and returns cleanup function. Use with beforeEach/afterEach.

```typescript
describe('myTests', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  it('uses the repository', () => {
    // ticketsRepository now uses the test database
    const ticket = ticketsRepository.create({ title: 'Test' })
  })
})
```

## Cross-Project Isolation Tests

Any query or endpoint that accepts `projectId` should have a cross-project isolation test to verify it doesn't leak data from other projects.

### Helpers

Import from `@kombuse/persistence/test-utils`:

```typescript
import {
  setupTestDb,
  TEST_PROJECT_ID,
  TEST_PROJECT_2_ID,
  seedSecondProject,
  seedMultiProjectData,
} from '@kombuse/persistence/test-utils'
```

- `seedSecondProject(db)` — creates a second project owned by `TEST_USER_ID`
- `seedMultiProjectData(db)` — creates the second project plus 2 tickets, 1 label, and 1 agent in it

### Pattern

```typescript
describe('cross-project isolation', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db

    // Seed a second project with data
    seedMultiProjectData(db)

    // Create data in the primary project
    ticketsRepository.create({
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      title: 'Project 1 ticket',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('should not return tickets from other projects', () => {
    const tickets = ticketsRepository.list({ project_id: TEST_PROJECT_ID })
    expect(tickets.every(t => t.project_id === TEST_PROJECT_ID)).toBe(true)
  })
})
```

### When to write these tests

- Any repository method that filters by `project_id`
- Any service method that takes `projectId` as a parameter
- Any API route under `/projects/:projectId/...`
- Any API route that accepts `project_id` as a query parameter

## Writing Tests

### Repository Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb } from '../test-utils'
import { ticketsRepository } from '../tickets'

describe('ticketsRepository', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  it('creates a ticket', () => {
    const ticket = ticketsRepository.create({
      title: 'Test ticket',
    })

    expect(ticket.id).toBeDefined()
    expect(ticket.title).toBe('Test ticket')
    expect(ticket.status).toBe('open')
  })
})
```

### Migration Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../database'

describe('migrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates tables', () => {
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]

    expect(tables.map(t => t.name)).toContain('tickets')
  })
})
```

## Test Fixtures

Shared fixtures in `tests/fixtures/`:

```typescript
// tests/fixtures/tickets.ts
import type { CreateTicketInput } from '@kombuse/types'

export const fixtures = {
  simpleTicket: {
    title: 'Simple test ticket',
    body: 'A basic ticket for testing',
  } satisfies CreateTicketInput,

  ticketWithPriority: {
    title: 'High priority ticket',
    priority: 4,
  } satisfies CreateTicketInput,
}
```

Use in tests:

```typescript
import { fixtures } from '../../../tests/fixtures/tickets'

it('creates ticket from fixture', () => {
  const ticket = ticketsRepository.create(fixtures.simpleTicket)
  expect(ticket.title).toBe('Simple test ticket')
})
```

## JSON Output

Tests output JSON to `test-results.json` for programmatic parsing:

```json
{
  "numTotalTests": 33,
  "numPassedTests": 33,
  "numFailedTests": 0,
  "testResults": [
    {
      "name": "src/__tests__/tickets.test.ts",
      "status": "passed",
      "assertionResults": [
        {
          "title": "creates a ticket with required fields",
          "status": "passed"
        }
      ]
    }
  ]
}
```

## Configuration

### Root: vitest.workspace.ts

```typescript
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/persistence',
  'packages/services',
  'packages/mcp',
  'packages/ui',
  'packages/agent',
  'apps/server',
])
```

### Package: vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: './test-results.json',
  },
})
```

### Turborepo: turbo.json

```json
{
  "tasks": {
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.test.ts"],
      "outputs": []
    }
  }
}
```

## Adding Tests to a New Package

1. Create `vitest.config.ts` in the package root
2. Add test script to `package.json`:
   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest"
     }
   }
   ```
3. Add package to `vitest.workspace.ts` if not already included
4. Create `src/__tests__/` directory for test files

## Agent-Friendly Testing

This test infrastructure is designed to help AI agents (like Claude Code) run, interpret, and write tests effectively.

### Test File Structure

Every test file follows a consistent structure for easy parsing:

```typescript
/**
 * @fileoverview Brief description of what this file tests
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/example.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "test name pattern"
 *
 * Tests cover:
 * - feature1: What it tests
 * - feature2: What it tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Test data constants at top - easy to find and modify
const TEST_INPUT = { title: 'Test' }
const NON_EXISTENT_ID = 999999

describe('moduleName', () => {
  // Setup/teardown
  let cleanup: () => void
  beforeEach(() => { /* setup */ })
  afterEach(() => { /* cleanup */ })

  /*
   * SECTION HEADER
   * Brief explanation of this test group
   */
  describe('methodName', () => {
    it('should {expected behavior}', () => {
      // Arrange
      const input = TEST_INPUT

      // Act
      const result = someFunction(input)

      // Assert with descriptive messages
      expect(result.field, 'Explanation of what went wrong').toBe(expected)
    })

    // Edge case: explain why this test exists
    it('should handle edge case', () => { /* ... */ })
  })
})
```

### Running Tests

```bash
# Run all tests - returns exit code 0 (pass) or 1 (fail)
bun run test

# Run with coverage to identify untested code
bun run --filter @kombuse/persistence test:coverage

# Run specific test file
bun run --filter @kombuse/persistence test -- src/__tests__/tickets.test.ts

# Run tests matching a pattern
bun run --filter @kombuse/persistence test -- -t "should create"
```

### Interpreting Results

**Console output** shows pass/fail status with clear error messages:
```
✓ ticketsRepository > create > should create a ticket with required fields
✗ ticketsRepository > create > should set default status
  AssertionError: expected 'pending' to be 'open'
```

**JSON output** (`test-results.json`) provides structured data:
```json
{
  "numFailedTests": 1,
  "testResults": [{
    "name": "src/__tests__/tickets.test.ts",
    "assertionResults": [{
      "title": "should set default status",
      "status": "failed",
      "failureMessages": ["AssertionError: expected 'pending' to be 'open'"]
    }]
  }]
}
```

**Coverage output** (`coverage/coverage-summary.json`) shows what needs tests:
```json
{
  "total": {
    "lines": { "pct": 85.5 },
    "statements": { "pct": 85.5 },
    "functions": { "pct": 90.0 },
    "branches": { "pct": 75.0 }
  }
}
```

### Writing Tests

Follow these conventions so agents can understand and extend tests:

**1. Descriptive test names** - State expected behavior clearly:
```typescript
// Good: describes behavior
it('should return null when ticket does not exist')
it('should cascade delete activities when ticket is deleted')

// Bad: vague
it('works')
it('test delete')
```

**2. One assertion focus** - Each test verifies one behavior:
```typescript
// Good: focused
it('should create ticket with default open status', () => {
  const ticket = ticketsRepository.create({ title: 'Test' })
  expect(ticket.status).toBe('open')
})

// Bad: testing multiple behaviors
it('should create ticket', () => {
  const ticket = ticketsRepository.create({ title: 'Test' })
  expect(ticket.status).toBe('open')
  expect(ticket.created_at).toBeDefined()
  expect(ticket.id).toBeGreaterThan(0)
})
```

**3. Arrange-Act-Assert pattern**:
```typescript
it('should update ticket status', () => {
  // Arrange
  const ticket = ticketsRepository.create({ title: 'Test', status: 'open' })

  // Act
  const updated = ticketsRepository.update(ticket.id, { status: 'closed' })

  // Assert
  expect(updated?.status).toBe('closed')
})
```

**4. Group related tests** with `describe` blocks:
```typescript
describe('ticketsRepository', () => {
  describe('create', () => {
    it('should create with required fields')
    it('should create with optional fields')
    it('should set default status to open')
  })

  describe('delete', () => {
    it('should delete existing ticket')
    it('should return false for non-existent ticket')
    it('should cascade delete activities')
  })
})
```

**5. Use fixtures for complex test data**:
```typescript
import { fixtures } from '../../../tests/fixtures/tickets'

it('should handle ticket with all fields', () => {
  const ticket = ticketsRepository.create(fixtures.ticketWithPriority)
  expect(ticket.priority).toBe(4)
})
```

### Test Naming Convention

Format: `should {expected behavior} [when {condition}]`

Examples:
- `should create ticket with required fields`
- `should return null when ticket does not exist`
- `should filter by status when status filter is provided`
- `should cascade delete activities when ticket is deleted`

### Adding Tests for New Features

When implementing a new feature, create tests that cover:

1. **Happy path** - Normal successful operation
2. **Edge cases** - Empty inputs, boundary values
3. **Error cases** - Invalid inputs, not found scenarios
4. **Side effects** - Timestamps updated, related records affected

Example for a new `archive` method:
```typescript
describe('archive', () => {
  it('should set status to archived')
  it('should update updated_at timestamp')
  it('should return null when ticket does not exist')
  it('should add activity log entry')
  it('should not archive already archived ticket')
})
```

## Coverage

Run coverage to identify untested code:

```bash
bun run --filter @kombuse/persistence test:coverage
```

Output locations:
- `coverage/index.html` - Visual HTML report
- `coverage/coverage-summary.json` - JSON summary for parsing
- Console - Text summary

Target: 80%+ line coverage for service layer code.

## Future: Integration & E2E Tests

```
tests/
  integration/
    api/
      tickets.test.ts       # REST API tests
    mcp/
      ticket-tools.test.ts  # MCP tool tests
  e2e/
    ticket-workflow.test.ts # Full workflow tests
```

Integration tests will use the same `createTestDatabase()` utility with Fastify's injection API for HTTP testing.
