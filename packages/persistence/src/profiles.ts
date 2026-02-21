import type {
  Profile,
  ProfileFilters,
  CreateProfileInput,
  UpdateProfileInput,
} from '@kombuse/types'
import { getDatabase } from './database'

/**
 * Data access layer for profiles (users and agents)
 */
export const profilesRepository = {
  /**
   * List all profiles with optional filters
   */
  list(filters?: ProfileFilters): Profile[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.type) {
      conditions.push('type = ?')
      params.push(filters.type)
    }
    if (filters?.is_active !== undefined) {
      conditions.push('is_active = ?')
      params.push(filters.is_active ? 1 : 0)
    }
    if (filters?.search) {
      conditions.push('(name LIKE ? OR email LIKE ? OR description LIKE ?)')
      params.push(
        `%${filters.search}%`,
        `%${filters.search}%`,
        `%${filters.search}%`
      )
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const limit = filters?.limit || 100
    const offset = filters?.offset || 0

    const stmt = db.prepare(`
      SELECT * FROM profiles
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...params, limit, offset) as RawProfile[]
    return rows.map(mapProfile)
  },

  /**
   * Get a single profile by ID
   */
  get(id: string): Profile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM profiles WHERE id = ?')
      .get(id) as RawProfile | undefined
    return row ? mapProfile(row) : null
  },

  /**
   * Get a profile by email
   */
  getByEmail(email: string): Profile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM profiles WHERE email = ?')
      .get(email) as RawProfile | undefined
    return row ? mapProfile(row) : null
  },

  /**
   * Get a profile by name (for @mention lookup)
   */
  getByName(name: string): Profile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM profiles WHERE name = ? AND is_active = 1')
      .get(name) as RawProfile | undefined
    return row ? mapProfile(row) : null
  },

  /**
   * Get a profile by external ID
   */
  getByExternalId(source: string, externalId: string): Profile | null {
    const db = getDatabase()
    const row = db
      .prepare(
        'SELECT * FROM profiles WHERE external_source = ? AND external_id = ?'
      )
      .get(source, externalId) as RawProfile | undefined
    return row ? mapProfile(row) : null
  },

  /**
   * Get a profile by slug (includes soft-deleted profiles)
   */
  getBySlug(slug: string): Profile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM profiles WHERE slug = ?')
      .get(slug) as RawProfile | undefined
    return row ? mapProfile(row) : null
  },

  /**
   * Create a new profile
   */
  create(input: CreateProfileInput): Profile {
    const db = getDatabase()
    const id = input.id || crypto.randomUUID()

    db.prepare(
      `
      INSERT INTO profiles (
        id, type, name, slug, email, description, avatar_url,
        external_source, external_id, plugin_id, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `
    ).run(
      id,
      input.type,
      input.name,
      input.slug ?? null,
      input.email ?? null,
      input.description ?? null,
      input.avatar_url ?? null,
      input.external_source ?? null,
      input.external_id ?? null,
      input.plugin_id ?? null
    )

    return this.get(id) as Profile
  },

  /**
   * Update an existing profile
   */
  update(id: string, input: UpdateProfileInput): Profile | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      params.push(input.name)
    }
    if (input.email !== undefined) {
      fields.push('email = ?')
      params.push(input.email)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.avatar_url !== undefined) {
      fields.push('avatar_url = ?')
      params.push(input.avatar_url)
    }
    if (input.plugin_id !== undefined) {
      fields.push('plugin_id = ?')
      params.push(input.plugin_id)
    }
    if (input.is_active !== undefined) {
      fields.push('is_active = ?')
      params.push(input.is_active ? 1 : 0)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  /**
   * Get multiple profiles by IDs (batch operation)
   */
  getByIds(ids: string[]): Map<string, Profile> {
    if (ids.length === 0) return new Map()

    const db = getDatabase()
    const uniqueIds = [...new Set(ids)]
    const placeholders = uniqueIds.map(() => '?').join(', ')

    const rows = db
      .prepare(`SELECT * FROM profiles WHERE id IN (${placeholders})`)
      .all(...uniqueIds) as RawProfile[]

    const profileMap = new Map<string, Profile>()
    for (const row of rows) {
      profileMap.set(row.id, mapProfile(row))
    }
    return profileMap
  },

  /**
   * Soft delete a profile (sets is_active = 0)
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const result = db
      .prepare(
        "UPDATE profiles SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
      )
      .run(id)
    return result.changes > 0
  },
}

// Raw profile from database (is_active is stored as INTEGER)
interface RawProfile {
  id: string
  type: 'user' | 'agent'
  name: string
  slug: string | null
  email: string | null
  description: string | null
  avatar_url: string | null
  external_source: string | null
  external_id: string | null
  plugin_id: string | null
  is_active: number
  created_at: string
  updated_at: string
}

// Map database row to Profile type
function mapProfile(row: RawProfile): Profile {
  return {
    ...row,
    is_active: row.is_active === 1,
  }
}
