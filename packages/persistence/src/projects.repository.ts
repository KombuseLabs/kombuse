import type {
  Project,
  ProjectFilters,
  CreateProjectInput,
  UpdateProjectInput,
} from '@kombuse/types'
import { toSlug, UUID_REGEX } from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for projects
 */
export const projectsRepository = {
  /**
   * List all projects with optional filters
   */
  list(filters?: ProjectFilters): Project[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.owner_id) {
      conditions.push('owner_id = ?')
      params.push(filters.owner_id)
    }
    if (filters?.repo_source) {
      conditions.push('repo_source = ?')
      params.push(filters.repo_source)
    }
    if (filters?.search) {
      conditions.push('(name LIKE ? OR description LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM projects
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(...params, limit, offset) as Project[]
  },

  /**
   * Get a single project by ID
   */
  get(id: string): Project | null {
    const db = getDatabase()
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as Project | undefined
    return project ?? null
  },

  /**
   * Create a new project
   */
  create(input: CreateProjectInput): Project {
    const db = getDatabase()
    const id = input.id || crypto.randomUUID()
    const slug = input.slug || this._generateUniqueSlug(toSlug(input.name))

    db.prepare(
      `
      INSERT INTO projects (
        id, name, slug, description, owner_id, local_path,
        repo_source, repo_owner, repo_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.name,
      slug,
      input.description ?? null,
      input.owner_id,
      input.local_path ?? null,
      input.repo_source ?? null,
      input.repo_owner ?? null,
      input.repo_name ?? null
    )

    return this.get(id) as Project
  },

  /**
   * Update an existing project
   */
  update(id: string, input: UpdateProjectInput): Project | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.slug !== undefined) {
      fields.push('slug = ?')
      params.push(input.slug)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.local_path !== undefined) {
      fields.push('local_path = ?')
      params.push(input.local_path)
    }
    if (input.repo_source !== undefined) {
      fields.push('repo_source = ?')
      params.push(input.repo_source)
    }
    if (input.repo_owner !== undefined) {
      fields.push('repo_owner = ?')
      params.push(input.repo_owner)
    }
    if (input.repo_name !== undefined) {
      fields.push('repo_name = ?')
      params.push(input.repo_name)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  /**
   * Delete a project
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return result.changes > 0
  },

  getBySlug(slug: string): Project | null {
    const db = getDatabase()
    const project = db
      .prepare('SELECT * FROM projects WHERE slug = ?')
      .get(slug) as Project | undefined
    return project ?? null
  },

  getByIdOrSlug(identifier: string): Project | null {
    if (UUID_REGEX.test(identifier)) {
      return this.get(identifier)
    }
    return this.getBySlug(identifier)
  },

  _generateUniqueSlug(baseSlug: string): string {
    const db = getDatabase()
    const existing = db
      .prepare('SELECT slug FROM projects WHERE slug = ?')
      .get(baseSlug) as { slug: string } | undefined
    if (!existing) return baseSlug

    let counter = 2
    while (true) {
      const candidate = `${baseSlug}-${counter}`
      const found = db
        .prepare('SELECT slug FROM projects WHERE slug = ?')
        .get(candidate) as { slug: string } | undefined
      if (!found) return candidate
      counter++
    }
  },
}
