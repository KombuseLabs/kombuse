/**
 * @fileoverview Tests for labels repository CRUD operations
 *
 * Run all: bun run --filter @kombuse/persistence test -- src/__tests__/labels.test.ts
 * Run one: bun run --filter @kombuse/persistence test -- -t "should create a label"
 *
 * Tests cover:
 * - create: Insert new labels with required/optional fields
 * - get: Retrieve single label by ID
 * - list: Query labels with filters
 * - getByProject: Get all labels for a project
 * - update: Modify existing labels
 * - delete: Remove labels
 * - addToTicket/removeFromTicket: Manage ticket-label associations
 * - getTicketLabels: Get all labels for a ticket
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DatabaseType } from 'better-sqlite3'
import { setupTestDb, TEST_USER_ID, TEST_AGENT_ID, TEST_PROJECT_ID } from '../test-utils'
import { labelsRepository } from '../labels'
import { ticketsRepository } from '../tickets'
import { eventsRepository } from '../events'
import { pluginsRepository } from '../plugins'

const NON_EXISTENT_ID = 999999

describe('labelsRepository', () => {
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

  /*
   * CREATE TESTS
   */
  describe('create', () => {
    it('should create a label with required fields only', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      expect(label.id).toBeDefined()
      expect(label.project_id).toBe(TEST_PROJECT_ID)
      expect(label.name).toBe('bug')
      expect(label.color, 'Default color should be gray').toBe('#808080')
      expect(label.description).toBeNull()
    })

    it('should create a label with all optional fields', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'enhancement',
        color: '#00ff00',
        description: 'New features or improvements',
      })

      expect(label.name).toBe('enhancement')
      expect(label.color).toBe('#00ff00')
      expect(label.description).toBe('New features or improvements')
    })

    it('should auto-generate timestamp on creation', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'test-label',
      })

      expect(label.created_at).toBeDefined()
      expect(() => new Date(label.created_at)).not.toThrow()
    })
  })

  /*
   * GET TESTS
   */
  describe('get', () => {
    it('should return null for non-existent label ID', () => {
      const label = labelsRepository.get(NON_EXISTENT_ID)

      expect(label).toBeNull()
    })

    it('should return label by ID', () => {
      const created = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      const label = labelsRepository.get(created.id)

      expect(label).not.toBeNull()
      expect(label?.id).toBe(created.id)
      expect(label?.name).toBe('bug')
    })
  })

  describe('getByProject', () => {
    it('should return all labels for a project', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'bug' })
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'enhancement' })
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'documentation' })

      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)

      expect(labels).toHaveLength(3)
      expect(labels.every((l) => l.project_id === TEST_PROJECT_ID)).toBe(true)
    })

    it('should return empty array for project with no labels', () => {
      const labels = labelsRepository.getByProject('non-existent-project')

      expect(labels).toHaveLength(0)
    })

    it('should return labels sorted by name', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'c-label' })
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'a-label' })
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'b-label' })

      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)

      expect(labels[0]?.name).toBe('a-label')
      expect(labels[1]?.name).toBe('b-label')
      expect(labels[2]?.name).toBe('c-label')
    })
  })

  /*
   * LIST TESTS
   */
  describe('list', () => {
    beforeEach(() => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'bug' })
      labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'enhancement',
        description: 'Improvements',
      })
    })

    it('should return all labels when no filters provided', () => {
      const labels = labelsRepository.list()

      expect(labels).toHaveLength(2)
    })

    it('should filter labels by project_id', () => {
      const labels = labelsRepository.list({ project_id: TEST_PROJECT_ID })

      expect(labels).toHaveLength(2)
      expect(labels.every((l) => l.project_id === TEST_PROJECT_ID)).toBe(true)
    })

    it('should search labels by name', () => {
      const results = labelsRepository.list({ search: 'bug' })

      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('bug')
    })

    it('should search labels by description', () => {
      const results = labelsRepository.list({ search: 'Improvements' })

      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('enhancement')
    })
  })

  describe('list usage sorting', () => {
    it('should sort labels by open-ticket usage count and include usage_count metadata', () => {
      const alpha = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'alpha' })
      const beta = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'beta' })
      const gamma = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'gamma' })

      const openTicketOne = ticketsRepository.create({
        title: 'Open 1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      const openTicketTwo = ticketsRepository.create({
        title: 'Open 2',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      const closedTicket = ticketsRepository.create({
        title: 'Closed',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'closed',
      })

      labelsRepository.addToTicket(openTicketOne.id, beta.id)
      labelsRepository.addToTicket(openTicketTwo.id, beta.id)
      labelsRepository.addToTicket(openTicketOne.id, alpha.id)
      labelsRepository.addToTicket(closedTicket.id, alpha.id)
      labelsRepository.addToTicket(closedTicket.id, gamma.id)

      const labels = labelsRepository.list({
        project_id: TEST_PROJECT_ID,
        sort: 'usage',
        usage_scope: 'open',
      })

      expect(labels[0]?.name).toBe('beta')
      expect(labels[0]?.usage_count).toBe(2)
      expect(labels[1]?.name).toBe('alpha')
      expect(labels[1]?.usage_count).toBe(1)
      expect(labels[2]?.name).toBe('gamma')
      expect(labels[2]?.usage_count).toBe(0)
    })

    it('should tie-break usage sorting by label name ascending', () => {
      const zeta = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'zeta' })
      const alpha = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'alpha' })

      const openTicketOne = ticketsRepository.create({
        title: 'Open 1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      const openTicketTwo = ticketsRepository.create({
        title: 'Open 2',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })

      labelsRepository.addToTicket(openTicketOne.id, zeta.id)
      labelsRepository.addToTicket(openTicketTwo.id, alpha.id)

      const labels = labelsRepository.list({
        project_id: TEST_PROJECT_ID,
        sort: 'usage',
        usage_scope: 'open',
      })

      expect(labels[0]?.name).toBe('alpha')
      expect(labels[0]?.usage_count).toBe(1)
      expect(labels[1]?.name).toBe('zeta')
      expect(labels[1]?.usage_count).toBe(1)
    })

    it('should not count cross-project ticket-label associations in usage_count (open scope)', () => {
      const SECOND_PROJECT_ID = 'test-project-2'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Second Project', ?)`
      ).run(SECOND_PROJECT_ID, TEST_USER_ID)

      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'scoped-label',
      })

      const ticketA = ticketsRepository.create({
        title: 'Ticket in project A',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      labelsRepository.addToTicket(ticketA.id, label.id)

      const ticketB = ticketsRepository.create({
        title: 'Ticket in project B',
        project_id: SECOND_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      db.prepare('INSERT INTO ticket_labels (ticket_id, label_id) VALUES (?, ?)').run(
        ticketB.id,
        label.id
      )

      const labels = labelsRepository.list({
        project_id: TEST_PROJECT_ID,
        sort: 'usage',
        usage_scope: 'open',
      })

      const scopedLabel = labels.find((l) => l.id === label.id)
      expect(
        scopedLabel?.usage_count,
        'Cross-project ticket should not inflate usage_count'
      ).toBe(1)
    })

    it('should not count cross-project ticket-label associations in usage_count (all-status scope)', () => {
      const SECOND_PROJECT_ID = 'test-project-2'
      db.prepare(
        `INSERT INTO projects (id, name, owner_id) VALUES (?, 'Second Project', ?)`
      ).run(SECOND_PROJECT_ID, TEST_USER_ID)

      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'all-scope-label',
      })

      const ticketA = ticketsRepository.create({
        title: 'Ticket in project A',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      labelsRepository.addToTicket(ticketA.id, label.id)

      const ticketB = ticketsRepository.create({
        title: 'Ticket in project B',
        project_id: SECOND_PROJECT_ID,
        author_id: TEST_USER_ID,
        status: 'open',
      })
      db.prepare('INSERT INTO ticket_labels (ticket_id, label_id) VALUES (?, ?)').run(
        ticketB.id,
        label.id
      )

      const labels = labelsRepository.list({
        project_id: TEST_PROJECT_ID,
        sort: 'usage',
      })

      const scopedLabel = labels.find((l) => l.id === label.id)
      expect(
        scopedLabel?.usage_count,
        'Cross-project ticket should not inflate usage_count for all-status scope'
      ).toBe(1)
    })
  })

  /*
   * UPDATE TESTS
   */
  describe('update', () => {
    it('should update label name', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      const updated = labelsRepository.update(label.id, { name: 'defect' })

      expect(updated?.name).toBe('defect')
    })

    it('should update label color', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      const updated = labelsRepository.update(label.id, { color: '#ff0000' })

      expect(updated?.color).toBe('#ff0000')
    })

    it('should return null when updating non-existent label', () => {
      const result = labelsRepository.update(NON_EXISTENT_ID, { name: 'New' })

      expect(result).toBeNull()
    })

    it('should support partial updates', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
        color: '#ff0000',
        description: 'Original description',
      })

      const updated = labelsRepository.update(label.id, { name: 'defect' })

      expect(updated?.name).toBe('defect')
      expect(updated?.color, 'Color should remain unchanged').toBe('#ff0000')
      expect(updated?.description, 'Description should remain unchanged').toBe(
        'Original description'
      )
    })

    it('should return existing label when update has no fields', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      const result = labelsRepository.update(label.id, {})

      expect(result?.id).toBe(label.id)
      expect(result?.name).toBe(label.name)
    })
  })

  /*
   * DELETE TESTS
   */
  describe('delete', () => {
    it('should delete existing label and return true', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })

      const deleted = labelsRepository.delete(label.id)

      expect(deleted).toBe(true)
      expect(labelsRepository.get(label.id)).toBeNull()
    })

    it('should return false when deleting non-existent label', () => {
      const deleted = labelsRepository.delete(NON_EXISTENT_ID)

      expect(deleted).toBe(false)
    })
  })

  /*
   * TICKET-LABEL ASSOCIATION TESTS
   */
  describe('addToTicket', () => {
    it('should add a label to a ticket', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)

      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels).toHaveLength(1)
      expect(ticketLabels[0]?.id).toBe(label.id)
    })

    it('should not duplicate label on ticket (idempotent)', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket.id, label.id)
      labelsRepository.addToTicket(ticket.id, label.id)

      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels, 'Label should not be duplicated').toHaveLength(1)
    })
  })

  describe('removeFromTicket', () => {
    it('should remove a label from a ticket', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket.id, label.id)
      const removed = labelsRepository.removeFromTicket(ticket.id, label.id)

      expect(removed).toBe(true)
      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels).toHaveLength(0)
    })

    it('should return false when removing non-existent association', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const removed = labelsRepository.removeFromTicket(ticket.id, NON_EXISTENT_ID)

      expect(removed).toBe(false)
    })
  })

  describe('getTicketLabels', () => {
    it('should return all labels for a ticket', () => {
      const label1 = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const label2 = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'urgent',
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket.id, label1.id)
      labelsRepository.addToTicket(ticket.id, label2.id)

      const labels = labelsRepository.getTicketLabels(ticket.id)

      expect(labels).toHaveLength(2)
      expect(labels.map((l) => l.name).sort()).toEqual(['bug', 'urgent'])
    })

    it('should return empty array for ticket with no labels', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const labels = labelsRepository.getTicketLabels(ticket.id)

      expect(labels).toHaveLength(0)
    })
  })

  describe('getLabelsForTickets', () => {
    it('should return empty map for empty ticket IDs array', () => {
      const result = labelsRepository.getLabelsForTickets([])

      expect(result.size).toBe(0)
    })

    it('should return labels for multiple tickets', () => {
      const label1 = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const label2 = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'urgent',
      })
      const ticket1 = ticketsRepository.create({
        title: 'Ticket 1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const ticket2 = ticketsRepository.create({
        title: 'Ticket 2',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket1.id, label1.id)
      labelsRepository.addToTicket(ticket1.id, label2.id)
      labelsRepository.addToTicket(ticket2.id, label1.id)

      const result = labelsRepository.getLabelsForTickets([ticket1.id, ticket2.id])

      expect(result.size).toBe(2)
      expect(result.get(ticket1.id)).toHaveLength(2)
      expect(result.get(ticket2.id)).toHaveLength(1)
    })

    it('should return empty array for tickets without labels', () => {
      const ticket = ticketsRepository.create({
        title: 'No labels',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      const result = labelsRepository.getLabelsForTickets([ticket.id])

      expect(result.get(ticket.id)).toHaveLength(0)
    })

    it('should return labels sorted by name', () => {
      const labelC = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'c-label',
      })
      const labelA = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'a-label',
      })
      const labelB = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'b-label',
      })
      const ticket = ticketsRepository.create({
        title: 'Ticket with labels',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket.id, labelC.id)
      labelsRepository.addToTicket(ticket.id, labelA.id)
      labelsRepository.addToTicket(ticket.id, labelB.id)

      const result = labelsRepository.getLabelsForTickets([ticket.id])
      const labels = result.get(ticket.id)!

      expect(labels[0]?.name).toBe('a-label')
      expect(labels[1]?.name).toBe('b-label')
      expect(labels[2]?.name).toBe('c-label')
    })
  })

  describe('is_enabled filtering', () => {
    it('should default is_enabled to true on create', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'enabled-label',
      })

      expect(label.is_enabled).toBe(1)
    })

    it('should exclude disabled labels from list() by default', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'enabled' })
      const disabled = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'disabled' })
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(disabled.id)

      const labels = labelsRepository.list({ project_id: TEST_PROJECT_ID })

      expect(labels).toHaveLength(1)
      expect(labels[0]?.name).toBe('enabled')
    })

    it('should include disabled labels when is_enabled filter is false', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'enabled' })
      const disabled = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'disabled' })
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(disabled.id)

      const labels = labelsRepository.list({ project_id: TEST_PROJECT_ID, is_enabled: false })

      expect(labels).toHaveLength(2)
    })

    it('should exclude disabled labels from getByProject() by default', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'enabled' })
      const disabled = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'disabled' })
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(disabled.id)

      const labels = labelsRepository.getByProject(TEST_PROJECT_ID)

      expect(labels).toHaveLength(1)
      expect(labels[0]?.name).toBe('enabled')
    })

    it('should include disabled labels in getByProject() when includeDisabled is true', () => {
      labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'enabled' })
      const disabled = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'disabled' })
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(disabled.id)

      const labels = labelsRepository.getByProject(TEST_PROJECT_ID, true)

      expect(labels).toHaveLength(2)
    })

    it('should still return disabled labels on tickets via getTicketLabels()', () => {
      const disabled = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'disabled' })
      db.prepare('UPDATE labels SET is_enabled = 0 WHERE id = ?').run(disabled.id)

      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      labelsRepository.addToTicket(ticket.id, disabled.id)

      const labels = labelsRepository.getTicketLabels(ticket.id)

      expect(labels).toHaveLength(1)
      expect(labels[0]?.name).toBe('disabled')
    })

    it('should update is_enabled via update()', () => {
      const label = labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'test' })

      const updated = labelsRepository.update(label.id, { is_enabled: false })

      expect(updated?.is_enabled).toBe(0)
    })
  })

  describe('getTicketIds', () => {
    it('should return all ticket IDs with a specific label', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'bug',
      })
      const ticket1 = ticketsRepository.create({
        title: 'Ticket 1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const ticket2 = ticketsRepository.create({
        title: 'Ticket 2',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket1.id, label.id)
      labelsRepository.addToTicket(ticket2.id, label.id)

      const ticketIds = labelsRepository.getTicketIds(label.id)

      expect(ticketIds).toHaveLength(2)
      expect(ticketIds).toContain(ticket1.id)
      expect(ticketIds).toContain(ticket2.id)
    })

    it('should return empty array for label with no tickets', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'unused-label',
      })

      const ticketIds = labelsRepository.getTicketIds(label.id)

      expect(ticketIds).toHaveLength(0)
    })
  })

  describe('event actor_type resolution', () => {
    it('should set actor_type to "agent" when label is added by an agent', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'agent-label',
      })
      db.prepare('DELETE FROM events').run()

      labelsRepository.addToTicket(ticket.id, label.id, TEST_AGENT_ID)

      const events = eventsRepository.list({ event_type: 'label.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-added label should have actor_type "agent"').toBe('agent')
      expect(events[0]?.actor_id).toBe(TEST_AGENT_ID)
    })

    it('should set actor_type to "user" when label is added by a user', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'user-label',
      })
      db.prepare('DELETE FROM events').run()

      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)

      const events = eventsRepository.list({ event_type: 'label.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'User-added label should have actor_type "user"').toBe('user')
    })

    it('should set actor_type to "agent" when label is removed by an agent', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'remove-label',
      })
      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)
      db.prepare('DELETE FROM events').run()

      labelsRepository.removeFromTicket(ticket.id, label.id, TEST_AGENT_ID)

      const events = eventsRepository.list({ event_type: 'label.removed' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Agent-removed label should have actor_type "agent"').toBe('agent')
      expect(events[0]?.actor_id).toBe(TEST_AGENT_ID)
    })

    it('should set actor_type to "system" when label is added with no addedById', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'system-label',
      })
      db.prepare('DELETE FROM events').run()

      labelsRepository.addToTicket(ticket.id, label.id)

      const events = eventsRepository.list({ event_type: 'label.added' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Label added without actor should have actor_type "system"').toBe('system')
      expect(events[0]?.actor_id).toBeNull()
    })

    it('should set actor_type to "system" when label is removed with no removedById', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'system-remove-label',
      })
      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)
      db.prepare('DELETE FROM events').run()

      labelsRepository.removeFromTicket(ticket.id, label.id)

      const events = eventsRepository.list({ event_type: 'label.removed' })

      expect(events).toHaveLength(1)
      expect(events[0]?.actor_type, 'Label removed without actor should have actor_type "system"').toBe('system')
      expect(events[0]?.actor_id).toBeNull()
    })
  })

  /*
   * SLUG TESTS
   */
  describe('slug', () => {
    it('should auto-generate slug from name on create', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Cook it',
      })

      expect(label.slug).toBe('cook-it')
    })

    it('should use explicit slug when provided', () => {
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'My Label',
        slug: 'custom-slug',
      })

      expect(label.slug).toBe('custom-slug')
    })
  })

  /*
   * PLUGIN-SCOPED SLUG TESTS
   */
  describe('getBySlugAndPlugin', () => {
    function createPlugin(name: string) {
      return pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name,
        version: '1.0.0',
        description: `Plugin ${name}`,
        directory: `/tmp/${name}`,
        manifest: JSON.stringify({ name }),
      })
    }

    it('should find label by slug+project+plugin', () => {
      const plugin = createPlugin('label-plugin-a')
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: plugin.id,
      })

      const found = labelsRepository.getBySlugAndPlugin('bug', TEST_PROJECT_ID, plugin.id)
      expect(found).not.toBeNull()
      expect(found?.id).toBe(label.id)
    })

    it('should not return label from different plugin', () => {
      const pluginA = createPlugin('label-plugin-b')
      const pluginB = createPlugin('label-plugin-c')
      labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: pluginA.id,
      })

      const found = labelsRepository.getBySlugAndPlugin('bug', TEST_PROJECT_ID, pluginB.id)
      expect(found).toBeNull()
    })

    it('should allow same slug across different plugins in same project', () => {
      const pluginA = createPlugin('label-plugin-d')
      const pluginB = createPlugin('label-plugin-e')

      const labelA = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: pluginA.id,
      })
      const labelB = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: pluginB.id,
      })

      expect(labelA.id).not.toBe(labelB.id)
      const foundA = labelsRepository.getBySlugAndPlugin('bug', TEST_PROJECT_ID, pluginA.id)
      const foundB = labelsRepository.getBySlugAndPlugin('bug', TEST_PROJECT_ID, pluginB.id)
      expect(foundA?.id).toBe(labelA.id)
      expect(foundB?.id).toBe(labelB.id)
    })

    it('should reject same slug within same plugin and project', () => {
      const plugin = createPlugin('label-plugin-dup')
      labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: plugin.id,
      })

      expect(() => labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: plugin.id,
      })).toThrow()
    })
  })

  describe('remapTicketLabels', () => {
    it('should remap ticket-labels from old to new label ID', () => {
      const oldLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'OldBug',
      })
      const newLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'NewBug',
      })
      const ticket1 = ticketsRepository.create({
        title: 'Ticket 1',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const ticket2 = ticketsRepository.create({
        title: 'Ticket 2',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket1.id, oldLabel.id)
      labelsRepository.addToTicket(ticket2.id, oldLabel.id)

      const remapped = labelsRepository.remapTicketLabels(oldLabel.id, newLabel.id)

      expect(remapped).toBe(2)
      expect(labelsRepository.getTicketLabels(ticket1.id).map((l) => l.id)).toContain(newLabel.id)
      expect(labelsRepository.getTicketLabels(ticket2.id).map((l) => l.id)).toContain(newLabel.id)
    })

    it('should skip tickets that already have the new label', () => {
      const oldLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'OldFeature',
      })
      const newLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'NewFeature',
      })
      const ticket = ticketsRepository.create({
        title: 'Ticket with both',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      // Ticket already has both labels
      labelsRepository.addToTicket(ticket.id, oldLabel.id)
      labelsRepository.addToTicket(ticket.id, newLabel.id)

      const remapped = labelsRepository.remapTicketLabels(oldLabel.id, newLabel.id)

      expect(remapped).toBe(0)
      // Ticket should still have exactly the new label, old association cleaned up
      const ticketLabels = labelsRepository.getTicketLabels(ticket.id)
      expect(ticketLabels).toHaveLength(1)
      expect(ticketLabels[0]!.id).toBe(newLabel.id)
    })

    it('should clean up remaining old-label associations after remap', () => {
      const oldLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'OldUrgent',
      })
      const newLabel = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'NewUrgent',
      })
      const ticket1 = ticketsRepository.create({
        title: 'Only old label',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const ticket2 = ticketsRepository.create({
        title: 'Has both labels',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })

      labelsRepository.addToTicket(ticket1.id, oldLabel.id)
      labelsRepository.addToTicket(ticket2.id, oldLabel.id)
      labelsRepository.addToTicket(ticket2.id, newLabel.id)

      labelsRepository.remapTicketLabels(oldLabel.id, newLabel.id)

      // No remaining associations with old label
      expect(labelsRepository.getTicketIds(oldLabel.id)).toHaveLength(0)
      // ticket1 remapped, ticket2 kept existing
      expect(labelsRepository.getTicketLabels(ticket1.id).map((l) => l.id)).toContain(newLabel.id)
      expect(labelsRepository.getTicketLabels(ticket2.id)).toHaveLength(1)
    })
  })

  describe('enriched event payloads', () => {
    it('should include label_slug and label_plugin_id in addToTicket event', () => {
      const plugin = pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'test-plugin-1',
        version: '1.0.0',
        description: 'Test plugin',
        directory: '/tmp/test-plugin-1',
        manifest: JSON.stringify({ name: 'test-plugin-1' }),
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug Report',
        plugin_id: plugin.id,
      })
      db.prepare('DELETE FROM events').run()

      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)

      const events = eventsRepository.list({ event_type: 'label.added' })
      expect(events).toHaveLength(1)
      const payload = typeof events[0]!.payload === 'string'
        ? JSON.parse(events[0]!.payload)
        : events[0]!.payload
      expect(payload.label_id).toBe(label.id)
      expect(payload.label_name).toBe('Bug Report')
      expect(payload.label_slug).toBe('bug-report')
      expect(payload.label_plugin_id).toBe(plugin.id)
    })

    it('should include label_slug and label_plugin_id in removeFromTicket event', () => {
      const plugin = pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'test-plugin-2',
        version: '1.0.0',
        description: 'Test plugin',
        directory: '/tmp/test-plugin-2',
        manifest: JSON.stringify({ name: 'test-plugin-2' }),
      })
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Feature Request',
        plugin_id: plugin.id,
      })
      labelsRepository.addToTicket(ticket.id, label.id, TEST_USER_ID)
      db.prepare('DELETE FROM events').run()

      labelsRepository.removeFromTicket(ticket.id, label.id, TEST_USER_ID)

      const events = eventsRepository.list({ event_type: 'label.removed' })
      expect(events).toHaveLength(1)
      const payload = typeof events[0]!.payload === 'string'
        ? JSON.parse(events[0]!.payload)
        : events[0]!.payload
      expect(payload.label_id).toBe(label.id)
      expect(payload.label_name).toBe('Feature Request')
      expect(payload.label_slug).toBe('feature-request')
      expect(payload.label_plugin_id).toBe(plugin.id)
    })

    it('should handle null plugin_id for user-created labels', () => {
      const ticket = ticketsRepository.create({
        title: 'Test ticket',
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Manual Label',
      })
      db.prepare('DELETE FROM events').run()

      labelsRepository.addToTicket(ticket.id, label.id)

      const events = eventsRepository.list({ event_type: 'label.added' })
      const payload = typeof events[0]!.payload === 'string'
        ? JSON.parse(events[0]!.payload)
        : events[0]!.payload
      expect(payload.label_slug).toBe('manual-label')
      expect(payload.label_plugin_id).toBeNull()
    })
  })

  describe('getBySlugAndProject', () => {
    it('should find label by slug and project without plugin filter', () => {
      const plugin = pluginsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'slug-test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        directory: '/tmp/slug-test-plugin',
        manifest: JSON.stringify({ name: 'slug-test-plugin' }),
      })
      const label = labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Bug',
        plugin_id: plugin.id,
      })

      const found = labelsRepository.getBySlugAndProject('bug', TEST_PROJECT_ID)
      expect(found).not.toBeNull()
      expect(found?.id).toBe(label.id)
    })

    it('should return null for non-existent slug', () => {
      const found = labelsRepository.getBySlugAndProject('nonexistent', TEST_PROJECT_ID)
      expect(found).toBeNull()
    })

    it('should not return disabled labels', () => {
      labelsRepository.create({
        project_id: TEST_PROJECT_ID,
        name: 'Disabled Label',
      })
      db.prepare("UPDATE labels SET is_enabled = 0 WHERE slug = 'disabled-label'").run()

      const found = labelsRepository.getBySlugAndProject('disabled-label', TEST_PROJECT_ID)
      expect(found).toBeNull()
    })

    it('should not return labels from different projects', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('other-project', 'Other', ?)"
      ).run(TEST_USER_ID)

      labelsRepository.create({
        project_id: 'other-project',
        name: 'Bug',
      })

      const found = labelsRepository.getBySlugAndProject('bug', TEST_PROJECT_ID)
      expect(found).toBeNull()
    })
  })
})
