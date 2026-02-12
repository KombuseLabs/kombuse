import type {
  Milestone,
  MilestoneWithStats,
  MilestoneFilters,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from '@kombuse/types'
import { EVENT_TYPES } from '@kombuse/types'
import { getDatabase } from './database'
import { eventsRepository } from './events'

export const milestonesRepository = {
  list(filters?: MilestoneFilters): Milestone[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    return db
      .prepare(
        `SELECT * FROM milestones ${whereClause} ORDER BY due_date ASC NULLS LAST, created_at DESC`
      )
      .all(...params) as Milestone[]
  },

  get(id: number): Milestone | null {
    const db = getDatabase()
    const milestone = db
      .prepare('SELECT * FROM milestones WHERE id = ?')
      .get(id) as Milestone | undefined
    return milestone ?? null
  },

  getByProject(projectId: string): Milestone[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date ASC NULLS LAST, created_at DESC'
      )
      .all(projectId) as Milestone[]
  },

  listWithStats(filters?: MilestoneFilters): MilestoneWithStats[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.project_id) {
      conditions.push('m.project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.status) {
      conditions.push('m.status = ?')
      params.push(filters.status)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    return db
      .prepare(
        `SELECT
          m.*,
          COALESCE(SUM(CASE WHEN t.status != 'closed' THEN 1 ELSE 0 END), 0) AS open_count,
          COALESCE(SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END), 0) AS closed_count,
          COALESCE(COUNT(t.id), 0) AS total_count
        FROM milestones m
        LEFT JOIN tickets t ON t.milestone_id = m.id
        ${whereClause}
        GROUP BY m.id
        ORDER BY m.due_date ASC NULLS LAST, m.created_at DESC`
      )
      .all(...params) as MilestoneWithStats[]
  },

  getWithStats(id: number): MilestoneWithStats | null {
    const db = getDatabase()
    const milestone = db
      .prepare(
        `SELECT
          m.*,
          COALESCE(SUM(CASE WHEN t.status != 'closed' THEN 1 ELSE 0 END), 0) AS open_count,
          COALESCE(SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END), 0) AS closed_count,
          COALESCE(COUNT(t.id), 0) AS total_count
        FROM milestones m
        LEFT JOIN tickets t ON t.milestone_id = m.id
        WHERE m.id = ?
        GROUP BY m.id`
      )
      .get(id) as MilestoneWithStats | undefined
    return milestone ?? null
  },

  create(input: CreateMilestoneInput): Milestone {
    const db = getDatabase()

    const result = db
      .prepare(
        `INSERT INTO milestones (project_id, title, description, due_date)
        VALUES (?, ?, ?, ?)`
      )
      .run(
        input.project_id,
        input.title,
        input.description ?? null,
        input.due_date ?? null
      )

    const milestone = this.get(result.lastInsertRowid as number) as Milestone

    eventsRepository.create({
      event_type: EVENT_TYPES.MILESTONE_CREATED,
      project_id: input.project_id,
      actor_type: 'system',
      payload: { milestone_id: milestone.id, title: milestone.title },
    })

    return milestone
  },

  update(id: number, input: UpdateMilestoneInput): Milestone | null {
    const db = getDatabase()

    const existing = this.get(id)
    if (!existing) return null

    const fields: string[] = []
    const params: unknown[] = []

    if (input.title !== undefined) {
      fields.push('title = ?')
      params.push(input.title)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.due_date !== undefined) {
      fields.push('due_date = ?')
      params.push(input.due_date)
    }
    if (input.status !== undefined) {
      fields.push('status = ?')
      params.push(input.status)
    }

    if (fields.length === 0) return existing

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(
      `UPDATE milestones SET ${fields.join(', ')} WHERE id = ?`
    ).run(...params)

    const updated = this.get(id) as Milestone

    eventsRepository.create({
      event_type: EVENT_TYPES.MILESTONE_UPDATED,
      project_id: existing.project_id,
      actor_type: 'system',
      payload: { milestone_id: id, title: updated.title },
    })

    return updated
  },

  delete(id: number): boolean {
    const db = getDatabase()

    const existing = this.get(id)
    if (!existing) return false

    const result = db.prepare('DELETE FROM milestones WHERE id = ?').run(id)

    if (result.changes > 0) {
      eventsRepository.create({
        event_type: EVENT_TYPES.MILESTONE_DELETED,
        project_id: existing.project_id,
        actor_type: 'system',
        payload: { milestone_id: id, title: existing.title },
      })
    }

    return result.changes > 0
  },

  getTicketIds(milestoneId: number): number[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT id FROM tickets WHERE milestone_id = ?')
      .all(milestoneId) as { id: number }[]
    return rows.map((r) => r.id)
  },
}
