import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupTestDb,
  TEST_USER_ID,
  TEST_PROJECT_ID,
  TEST_PROJECT_2_ID,
  seedMultiProjectData,
} from '@kombuse/persistence/test-utils'
import { ticketsRepository } from '@kombuse/persistence'
import { ticketService } from '../ticket-service'

describe('ticketService cross-project isolation', () => {
  let cleanup: () => void

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    seedMultiProjectData(setup.db)

    // Create tickets in project-1
    ticketsRepository.create({
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      title: 'Project 1 task',
    })
    ticketsRepository.create({
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
      title: 'Project 1 bug',
      status: 'closed',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('should only return project-1 tickets when list is filtered by project_id', () => {
    const tickets = ticketService.list({ project_id: TEST_PROJECT_ID })

    expect(tickets.length).toBe(2)
    expect(
      tickets.every((t) => t.project_id === TEST_PROJECT_ID),
      'All tickets should belong to project 1'
    ).toBe(true)
  })

  it('should only return project-2 tickets when list is filtered by project_id', () => {
    const tickets = ticketService.list({ project_id: TEST_PROJECT_2_ID })

    // seedMultiProjectData creates 2 tickets in project-2
    expect(tickets.length).toBe(2)
    expect(
      tickets.every((t) => t.project_id === TEST_PROJECT_2_ID),
      'All tickets should belong to project 2'
    ).toBe(true)
  })

  it('should scope listWithRelations by project_id', () => {
    const tickets = ticketService.listWithRelations({ project_id: TEST_PROJECT_ID })

    expect(tickets.length).toBe(2)
    expect(
      tickets.every((t) => t.project_id === TEST_PROJECT_ID),
      'All tickets with relations should belong to project 1'
    ).toBe(true)
  })

  it('should scope search results by project_id', () => {
    const tickets = ticketService.listWithRelations({
      project_id: TEST_PROJECT_ID,
      search: 'ticket',
    })

    // "ticket" doesn't match project-1 titles ("task", "bug") but
    // seedMultiProjectData creates "Project 2 ticket A" and "Project 2 ticket B"
    // — those should NOT appear in project-1 results
    expect(
      tickets.every((t) => t.project_id === TEST_PROJECT_ID),
      'Search results should only include target project tickets'
    ).toBe(true)
  })

  it('should scope countByStatus to the specified project', () => {
    const p1Counts = ticketService.countByStatus(TEST_PROJECT_ID)
    const p2Counts = ticketService.countByStatus(TEST_PROJECT_2_ID)

    // Project 1: 1 open + 1 closed
    expect(p1Counts.open, 'Project 1 open count').toBe(1)
    expect(p1Counts.closed, 'Project 1 closed count').toBe(1)

    // Project 2: 1 open + 1 closed (from seedMultiProjectData)
    expect(p2Counts.open, 'Project 2 open count').toBe(1)
    expect(p2Counts.closed, 'Project 2 closed count').toBe(1)
  })
})
