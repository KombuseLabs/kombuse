import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
  ticketsRepository,
} from '@kombuse/persistence'
import {
  seedBaseData,
  seedMultiProjectData,
  TEST_PROJECT_ID,
  TEST_PROJECT_2_ID,
  TEST_USER_ID,
} from '@kombuse/persistence/test-utils'
import { ticketRoutes } from '../routes/tickets.routes'

describe('tickets route cross-project isolation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)
    seedBaseData(db)
    seedMultiProjectData(db)

    // Create tickets in project-1
    ticketsRepository.create({
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      title: 'Project 1 open ticket',
    })
    ticketsRepository.create({
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      title: 'Project 1 closed ticket',
      status: 'closed',
    })

    app = Fastify()
    await app.register(ticketRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should only return tickets from the requested project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets?project_id=${TEST_PROJECT_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const tickets = response.json()
    expect(tickets.length).toBeGreaterThanOrEqual(2)
    expect(
      tickets.every((t: { project_id: string }) => t.project_id === TEST_PROJECT_ID),
      'All returned tickets should belong to the requested project'
    ).toBe(true)
  })

  it('should only return project-2 tickets when project_id is project-2', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets?project_id=${TEST_PROJECT_2_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const tickets = response.json()
    expect(tickets.length).toBeGreaterThanOrEqual(2)
    expect(
      tickets.every((t: { project_id: string }) => t.project_id === TEST_PROJECT_2_ID),
      'All returned tickets should belong to project 2'
    ).toBe(true)
  })

  it('should return correct counts per project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/counts?project_id=${TEST_PROJECT_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const counts = response.json()
    // Project 1 has 1 open + 1 closed
    expect(counts.open).toBe(1)
    expect(counts.closed).toBe(1)
  })

  it('should not include project-2 tickets in project-1 counts', async () => {
    const p1Response = await app.inject({
      method: 'GET',
      url: `/api/tickets/counts?project_id=${TEST_PROJECT_ID}`,
    })
    const p2Response = await app.inject({
      method: 'GET',
      url: `/api/tickets/counts?project_id=${TEST_PROJECT_2_ID}`,
    })

    const p1Counts = p1Response.json()
    const p2Counts = p2Response.json()

    // seedMultiProjectData creates 1 open + 1 closed in project-2
    // We created 1 open + 1 closed in project-1
    expect(p1Counts.open, 'Project 1 open count').toBe(1)
    expect(p1Counts.closed, 'Project 1 closed count').toBe(1)
    expect(p2Counts.open, 'Project 2 open count').toBe(1)
    expect(p2Counts.closed, 'Project 2 closed count').toBe(1)
  })
})
