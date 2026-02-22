import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb, TEST_USER_ID, TEST_PROJECT_ID } from '../test-utils'
import { milestonesRepository } from '../milestones'
import { ticketsRepository } from '../tickets'
import type { DatabaseType } from '../database'

describe('milestonesRepository', () => {
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

  describe('create', () => {
    it('should create a milestone with all fields', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'v1.0 Release',
        description: 'First major release',
        due_date: '2026-03-01',
      })

      expect(milestone.id, 'Should have an ID').toBeGreaterThan(0)
      expect(milestone.title, 'Title should match').toBe('v1.0 Release')
      expect(milestone.description, 'Description should match').toBe(
        'First major release'
      )
      expect(milestone.due_date, 'Due date should match').toBe('2026-03-01')
      expect(milestone.status, 'Default status should be open').toBe('open')
      expect(milestone.project_id, 'Project ID should match').toBe(
        TEST_PROJECT_ID
      )
      expect(milestone.created_at, 'Should have created_at').toBeTruthy()
      expect(milestone.updated_at, 'Should have updated_at').toBeTruthy()
    })

    it('should create a milestone with minimal fields', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Sprint 1',
      })

      expect(milestone.title, 'Title should match').toBe('Sprint 1')
      expect(milestone.description, 'Description should be null').toBeNull()
      expect(milestone.due_date, 'Due date should be null').toBeNull()
      expect(milestone.status, 'Status should be open').toBe('open')
    })
  })

  describe('get', () => {
    it('should return milestone by ID', () => {
      const created = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Test Milestone',
      })

      const retrieved = milestonesRepository.get(created.id)

      expect(retrieved, 'Should find milestone').not.toBeNull()
      expect(retrieved?.id, 'ID should match').toBe(created.id)
      expect(retrieved?.title, 'Title should match').toBe('Test Milestone')
    })

    it('should return null for non-existent ID', () => {
      const result = milestonesRepository.get(99999)
      expect(result, 'Should return null').toBeNull()
    })
  })

  describe('list', () => {
    it('should list milestones by project', () => {
      // Create a second project for isolation
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Other Project', ?)"
      ).run(TEST_USER_ID)

      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M1',
      })
      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M2',
      })
      milestonesRepository.create({
        project_id: 'project-2',
        title: 'M3',
      })

      const result = milestonesRepository.list({
        project_id: TEST_PROJECT_ID,
      })

      expect(result.length, 'Should have 2 milestones').toBe(2)
      expect(
        result.every((m) => m.project_id === TEST_PROJECT_ID),
        'All should belong to test project'
      ).toBe(true)
    })

    it('should filter by status', () => {
      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Open MS',
      })
      const closed = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Closed MS',
      })
      milestonesRepository.update(closed.id, { status: 'closed' })

      const openOnly = milestonesRepository.list({
        project_id: TEST_PROJECT_ID,
        status: 'open',
      })

      expect(openOnly.length, 'Should have 1 open milestone').toBe(1)
      expect(openOnly[0]?.title, 'Should be the open one').toBe('Open MS')
    })

    it('should list all milestones when no filters', () => {
      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'A',
      })
      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'B',
      })

      const result = milestonesRepository.list()

      expect(result.length, 'Should return all milestones').toBe(2)
    })
  })

  describe('listWithStats', () => {
    it('should compute ticket counts correctly', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'v1.0',
      })

      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Open ticket',
        status: 'open',
        milestone_id: milestone.id,
      })
      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Closed ticket',
        status: 'closed',
        milestone_id: milestone.id,
      })
      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'In progress ticket',
        status: 'in_progress',
        milestone_id: milestone.id,
      })

      const milestones = milestonesRepository.listWithStats({
        project_id: TEST_PROJECT_ID,
      })

      expect(milestones.length, 'Should have 1 milestone').toBe(1)
      expect(milestones[0]?.open_count, 'Should have 2 open (open + in_progress)').toBe(2)
      expect(milestones[0]?.closed_count, 'Should have 1 closed').toBe(1)
      expect(milestones[0]?.total_count, 'Should have 3 total').toBe(3)
    })

    it('should handle milestones with no tickets', () => {
      milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Empty',
      })

      const milestones = milestonesRepository.listWithStats({
        project_id: TEST_PROJECT_ID,
      })

      expect(milestones[0]?.open_count, 'Open count should be 0').toBe(0)
      expect(milestones[0]?.closed_count, 'Closed count should be 0').toBe(0)
      expect(milestones[0]?.total_count, 'Total count should be 0').toBe(0)
    })
  })

  describe('getWithStats', () => {
    it('should return milestone with computed stats', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'v2.0',
      })

      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'T1',
        milestone_id: milestone.id,
      })

      const result = milestonesRepository.getWithStats(milestone.id)

      expect(result, 'Should find milestone').not.toBeNull()
      expect(result?.title, 'Title should match').toBe('v2.0')
      expect(result?.total_count, 'Should have 1 ticket').toBe(1)
      expect(result?.open_count, 'Should have 1 open').toBe(1)
      expect(result?.closed_count, 'Should have 0 closed').toBe(0)
    })

    it('should return null for non-existent ID', () => {
      const result = milestonesRepository.getWithStats(99999)
      expect(result, 'Should return null').toBeNull()
    })
  })

  describe('update', () => {
    it('should update all fields', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Original',
      })

      const updated = milestonesRepository.update(milestone.id, {
        title: 'Updated',
        description: 'New description',
        due_date: '2026-04-01',
        status: 'closed',
      })

      expect(updated?.title, 'Title should be updated').toBe('Updated')
      expect(updated?.description, 'Description should be updated').toBe(
        'New description'
      )
      expect(updated?.due_date, 'Due date should be updated').toBe(
        '2026-04-01'
      )
      expect(updated?.status, 'Status should be updated').toBe('closed')
    })

    it('should handle partial updates', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Original',
        description: 'Keep this',
      })

      const updated = milestonesRepository.update(milestone.id, {
        title: 'New Title',
      })

      expect(updated?.title, 'Title should be updated').toBe('New Title')
      expect(updated?.description, 'Description should be unchanged').toBe(
        'Keep this'
      )
    })

    it('should return existing milestone for no-op update', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'No Change',
      })

      const result = milestonesRepository.update(milestone.id, {})

      expect(result?.title, 'Title should be unchanged').toBe('No Change')
    })

    it('should return null for non-existent ID', () => {
      const result = milestonesRepository.update(99999, { title: 'Nope' })
      expect(result, 'Should return null').toBeNull()
    })

    it('should allow setting fields to null', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Has desc',
        description: 'Will be removed',
        due_date: '2026-05-01',
      })

      const updated = milestonesRepository.update(milestone.id, {
        description: null,
        due_date: null,
      })

      expect(updated?.description, 'Description should be null').toBeNull()
      expect(updated?.due_date, 'Due date should be null').toBeNull()
    })
  })

  describe('delete', () => {
    it('should delete an existing milestone', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Delete me',
      })

      const deleted = milestonesRepository.delete(milestone.id)

      expect(deleted, 'Should return true').toBe(true)
      expect(
        milestonesRepository.get(milestone.id),
        'Milestone should be gone'
      ).toBeNull()
    })

    it('should return false for non-existent ID', () => {
      const result = milestonesRepository.delete(99999)
      expect(result, 'Should return false').toBe(false)
    })

    it('should set milestone_id to null on associated tickets', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Will be deleted',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Has milestone',
        milestone_id: milestone.id,
      })

      // Verify ticket has milestone
      const beforeDelete = ticketsRepository._getInternal(ticket.id)
      expect(
        beforeDelete?.milestone_id,
        'Ticket should have milestone_id before delete'
      ).toBe(milestone.id)

      milestonesRepository.delete(milestone.id)

      const afterDelete = ticketsRepository._getInternal(ticket.id)
      expect(
        afterDelete,
        'Ticket should still exist'
      ).not.toBeNull()
      expect(
        afterDelete?.milestone_id,
        'Ticket milestone_id should be null after delete'
      ).toBeNull()
    })
  })

  describe('getTicketIds', () => {
    it('should return ticket IDs for a milestone', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M1',
      })

      const t1 = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'T1',
        milestone_id: milestone.id,
      })
      const t2 = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'T2',
        milestone_id: milestone.id,
      })
      // Ticket without milestone
      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'T3',
      })

      const ids = milestonesRepository.getTicketIds(milestone.id)

      expect(ids.length, 'Should have 2 ticket IDs').toBe(2)
      expect(ids, 'Should include first ticket').toContain(t1.id)
      expect(ids, 'Should include second ticket').toContain(t2.id)
    })

    it('should return empty array for milestone with no tickets', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Empty',
      })

      const ids = milestonesRepository.getTicketIds(milestone.id)
      expect(ids.length, 'Should be empty').toBe(0)
    })
  })

  describe('ticket milestone_id integration', () => {
    it('should create a ticket with milestone_id', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Sprint 1',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Assigned ticket',
        milestone_id: milestone.id,
      })

      expect(
        ticket.milestone_id,
        'Ticket should have milestone_id'
      ).toBe(milestone.id)
    })

    it('should update a ticket milestone_id', () => {
      const m1 = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M1',
      })
      const m2 = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M2',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Move me',
        milestone_id: m1.id,
      })

      const updated = ticketsRepository.update(ticket.id, {
        milestone_id: m2.id,
      })

      expect(
        updated?.milestone_id,
        'Should be moved to M2'
      ).toBe(m2.id)
    })

    it('should unset milestone_id by setting to null', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M1',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Unset me',
        milestone_id: milestone.id,
      })

      const updated = ticketsRepository.update(ticket.id, {
        milestone_id: null,
      })

      expect(
        updated?.milestone_id,
        'Should be null'
      ).toBeNull()
    })

    it('should filter tickets by milestone_id', () => {
      const m1 = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'M1',
      })

      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'In M1',
        milestone_id: m1.id,
      })
      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'No milestone',
      })

      const filtered = ticketsRepository.list({
        project_id: TEST_PROJECT_ID,
        milestone_id: m1.id,
      })

      expect(filtered.length, 'Should have 1 ticket').toBe(1)
      expect(filtered[0]?.title, 'Should be the assigned one').toBe('In M1')
    })
  })

  describe('cross-project milestone validation', () => {
    it('should reject assigning a milestone from another project on create', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Other Project', ?)"
      ).run(TEST_USER_ID)

      const milestone = milestonesRepository.create({
        project_id: 'project-2',
        title: 'Other project milestone',
      })

      expect(
        () =>
          ticketsRepository.create({
            project_id: TEST_PROJECT_ID,
            author_id: TEST_USER_ID,
            title: 'Cross-project ticket',
            milestone_id: milestone.id,
          }),
        'Should reject cross-project milestone on create'
      ).toThrow('Milestone is invalid for this project')
    })

    it('should reject assigning a milestone from another project on update', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Other Project', ?)"
      ).run(TEST_USER_ID)

      const milestone = milestonesRepository.create({
        project_id: 'project-2',
        title: 'Other project milestone',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Will try cross-project update',
      })

      expect(
        () =>
          ticketsRepository.update(ticket.id, {
            milestone_id: milestone.id,
          }),
        'Should reject cross-project milestone on update'
      ).toThrow('Milestone is invalid for this project')
    })

    it('should allow setting milestone_id to null on update', () => {
      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Same project milestone',
      })

      const ticket = ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Has milestone',
        milestone_id: milestone.id,
      })

      const updated = ticketsRepository.update(ticket.id, {
        milestone_id: null,
      })

      expect(updated?.milestone_id, 'Should be null after unsetting').toBeNull()
    })

    it('should reject non-existent milestone_id on create', () => {
      expect(
        () =>
          ticketsRepository.create({
            project_id: TEST_PROJECT_ID,
            author_id: TEST_USER_ID,
            title: 'Bad milestone ID',
            milestone_id: 99999,
          }),
        'Should reject non-existent milestone'
      ).toThrow('Milestone is invalid for this project')
    })
  })

  describe('milestone stats isolation', () => {
    it('should not count cross-project tickets in listWithStats', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Other Project', ?)"
      ).run(TEST_USER_ID)

      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Stats test milestone',
      })

      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Same project ticket',
        milestone_id: milestone.id,
      })

      // Manually insert a cross-project ticket referencing this milestone
      // (simulates pre-fix data or direct SQL manipulation)
      db.prepare(
        `INSERT INTO tickets (project_id, author_id, title, milestone_id, status)
         VALUES ('project-2', ?, 'Cross project ticket', ?, 'open')`
      ).run(TEST_USER_ID, milestone.id)

      const milestones = milestonesRepository.listWithStats({
        project_id: TEST_PROJECT_ID,
      })

      expect(milestones.length, 'Should have 1 milestone').toBe(1)
      expect(
        milestones[0]?.total_count,
        'Should only count same-project ticket'
      ).toBe(1)
    })

    it('should not count cross-project tickets in getWithStats', () => {
      db.prepare(
        "INSERT INTO projects (id, name, owner_id) VALUES ('project-2', 'Other Project', ?)"
      ).run(TEST_USER_ID)

      const milestone = milestonesRepository.create({
        project_id: TEST_PROJECT_ID,
        title: 'Stats test milestone',
      })

      ticketsRepository.create({
        project_id: TEST_PROJECT_ID,
        author_id: TEST_USER_ID,
        title: 'Same project ticket',
        milestone_id: milestone.id,
      })

      db.prepare(
        `INSERT INTO tickets (project_id, author_id, title, milestone_id, status)
         VALUES ('project-2', ?, 'Cross project ticket', ?, 'open')`
      ).run(TEST_USER_ID, milestone.id)

      const result = milestonesRepository.getWithStats(milestone.id)

      expect(
        result?.total_count,
        'Should only count same-project ticket'
      ).toBe(1)
    })
  })
})
