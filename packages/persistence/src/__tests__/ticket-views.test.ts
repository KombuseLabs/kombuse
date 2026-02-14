import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { ticketViewsRepository } from '../ticket-views'
import { ticketsRepository } from '../tickets'
import { labelsRepository } from '../labels'
import { commentsRepository } from '../comments'

const TEST_TICKET = {
  title: 'Test ticket',
  project_id: TEST_PROJECT_ID,
  author_id: TEST_USER_ID,
}

describe('ticketViewsRepository', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
  })

  afterEach(() => {
    cleanup()
  })

  describe('upsert', () => {
    it('should create a view record', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const view = ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: TEST_USER_ID,
      })
      expect(view.ticket_id, 'ticket_id should match').toBe(ticket.id)
      expect(view.profile_id, 'profile_id should match').toBe(TEST_USER_ID)
      expect(view.last_viewed_at, 'last_viewed_at should be set').toBeDefined()
    })

    it('should update last_viewed_at on subsequent views', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const view1 = ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: TEST_USER_ID,
      })

      // Set an old timestamp to make the update visible
      db.prepare(
        "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE id = ?"
      ).run(view1.id)

      const view2 = ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: TEST_USER_ID,
      })
      expect(view2.last_viewed_at > '2020-01-01', 'should have updated timestamp').toBe(true)
    })

    it('should handle multiple users viewing the same ticket', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)

      // Create a second user
      db.prepare(
        "INSERT INTO profiles (id, type, name) VALUES ('user-2', 'user', 'User 2')"
      ).run()

      const view1 = ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: TEST_USER_ID,
      })
      const view2 = ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: 'user-2',
      })

      expect(view1.profile_id).toBe(TEST_USER_ID)
      expect(view2.profile_id).toBe('user-2')
    })
  })

  describe('getLastViewed', () => {
    it('should return null when no view exists', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      const view = ticketViewsRepository.getLastViewed(ticket.id, TEST_USER_ID)
      expect(view, 'should be null for unviewed ticket').toBeNull()
    })

    it('should return the view record when it exists', () => {
      const ticket = ticketsRepository.create(TEST_TICKET)
      ticketViewsRepository.upsert({
        ticket_id: ticket.id,
        profile_id: TEST_USER_ID,
      })
      const view = ticketViewsRepository.getLastViewed(ticket.id, TEST_USER_ID)
      expect(view, 'should not be null').not.toBeNull()
      expect(view?.ticket_id).toBe(ticket.id)
      expect(view?.profile_id).toBe(TEST_USER_ID)
    })
  })
})

describe('tickets list with viewer_id (has_unread)', () => {
  let cleanup: () => void
  let db: DatabaseType

  beforeEach(() => {
    const setup = setupTestDb()
    cleanup = setup.cleanup
    db = setup.db
  })

  afterEach(() => {
    cleanup()
  })

  it('should return has_unread=1 for tickets never viewed', () => {
    ticketsRepository.create({
      title: 'Unviewed ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    expect(tickets.length).toBeGreaterThan(0)
    expect((tickets[0] as any).has_unread, 'never-viewed ticket should be unread').toBe(1)
  })

  it('should return has_unread=0 after viewing the ticket', () => {
    const ticket = ticketsRepository.create({
      title: 'Will view this',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })
    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'viewed ticket should not be unread').toBe(0)
  })

  it('should return has_unread=1 after new activity since last view', () => {
    const ticket = ticketsRepository.create({
      title: 'Activity after view',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    // Set last_viewed_at to the past to simulate time passing
    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    // Update the ticket to trigger new activity
    ticketsRepository.update(ticket.id, { title: 'Updated title' })

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'ticket with new activity should be unread').toBe(1)
  })

  it('should keep has_unread=0 after self-authored comment create', () => {
    const ticket = ticketsRepository.create({
      title: 'Self comment create',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Self-authored comment',
    })

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'self-authored comment should not mark unread').toBe(0)
  })

  it('should keep has_unread=0 after self-authored comment edit', () => {
    const ticket = ticketsRepository.create({
      title: 'Self comment edit',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    const comment = commentsRepository.create({
      ticket_id: ticket.id,
      author_id: TEST_USER_ID,
      body: 'Initial body',
    })

    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    commentsRepository.update(comment.id, { body: 'Edited body' })

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'self-authored comment edit should not mark unread').toBe(0)
  })

  it('should return has_unread=1 after another user comments', () => {
    const ticket = ticketsRepository.create({
      title: 'Other user comment',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    db.prepare(
      "INSERT INTO profiles (id, type, name) VALUES ('user-2', 'user', 'User 2')"
    ).run()

    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    commentsRepository.create({
      ticket_id: ticket.id,
      author_id: 'user-2',
      body: 'Comment from someone else',
    })

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'other-user comment should mark unread').toBe(1)
  })

  it('should keep has_unread=0 after self-authored ticket update', () => {
    const ticket = ticketsRepository.create({
      title: 'Self ticket update',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    ticketsRepository.update(ticket.id, { title: 'Updated by self' }, TEST_USER_ID)

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'self-authored ticket update should not mark unread').toBe(0)
  })

  it('should return has_unread=1 after another user updates the ticket', () => {
    const ticket = ticketsRepository.create({
      title: 'Other user ticket update',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })

    db.prepare(
      "INSERT INTO profiles (id, type, name) VALUES ('user-2', 'user', 'User 2')"
    ).run()

    ticketViewsRepository.upsert({
      ticket_id: ticket.id,
      profile_id: TEST_USER_ID,
    })

    db.prepare(
      "UPDATE ticket_views SET last_viewed_at = '2020-01-01 00:00:00' WHERE ticket_id = ? AND profile_id = ?"
    ).run(ticket.id, TEST_USER_ID)

    ticketsRepository.update(ticket.id, { title: 'Updated by someone else' }, 'user-2')

    const tickets = ticketsRepository.list({ viewer_id: TEST_USER_ID })
    const found = tickets.find((t) => t.id === ticket.id)
    expect((found as any).has_unread, 'other-user ticket update should mark unread').toBe(1)
  })

  it('should not include has_unread when viewer_id is not provided', () => {
    ticketsRepository.create({
      title: 'No viewer',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const tickets = ticketsRepository.list()
    expect((tickets[0] as any).has_unread, 'should not have has_unread field').toBeUndefined()
  })

  it('should work with search filter and viewer_id together', () => {
    ticketsRepository.create({
      title: 'Searchable unread ticket',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const tickets = ticketsRepository.list({
      viewer_id: TEST_USER_ID,
      search: 'Searchable',
    })
    expect(tickets.length).toBeGreaterThan(0)
    expect((tickets[0] as any).has_unread).toBe(1)
  })

  it('should work with numeric ID search and viewer_id together', () => {
    const ticket = ticketsRepository.create({
      title: 'Numeric search with viewer',
      project_id: TEST_PROJECT_ID,
      author_id: TEST_USER_ID,
    })
    const tickets = ticketsRepository.list({
      viewer_id: TEST_USER_ID,
      search: String(ticket.id),
    })
    expect(tickets.length, 'Should find the ticket by numeric ID').toBeGreaterThanOrEqual(1)
    const found = tickets.find((t) => t.id === ticket.id)
    expect(found, 'Should include exact ID match').toBeDefined()
    expect((found as any).has_unread, 'Should compute unread status').toBe(1)
  })

  it('should work with label_ids filter and viewer_id together', () => {
    const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'bug' })
    const ticket = ticketsRepository.create({ ...TEST_TICKET, title: 'Bug ticket' })
    labelsRepository.addToTicket(ticket.id, label.id)

    const tickets = ticketsRepository.list({ label_ids: [label.id], viewer_id: TEST_USER_ID })

    expect(tickets).toHaveLength(1)
    expect(tickets[0]?.id).toBe(ticket.id)
    expect((tickets[0] as any).has_unread).toBe(1)
  })
})
