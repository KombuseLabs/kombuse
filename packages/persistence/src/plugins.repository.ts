import type {
  Plugin,
  PluginFilters,
  CreatePluginInput,
  UpdatePluginInput,
  KombusePluginManifest,
} from '@kombuse/types'
import { getDatabase } from './database'

interface RawPlugin {
  id: string
  project_id: string
  name: string
  version: string
  description: string | null
  directory: string
  manifest: string
  is_enabled: number
  installed_at: string
  updated_at: string
}

function mapPlugin(row: RawPlugin): Plugin {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    version: row.version,
    description: row.description,
    directory: row.directory,
    manifest: JSON.parse(row.manifest) as KombusePluginManifest,
    is_enabled: row.is_enabled === 1,
    installed_at: row.installed_at,
    updated_at: row.updated_at,
  }
}

export const pluginsRepository = {
  create(input: CreatePluginInput): Plugin {
    const db = getDatabase()
    const id = input.id ?? crypto.randomUUID()

    db.prepare(
      `
      INSERT INTO plugins (
        id, project_id, name, version, description, directory, manifest, is_enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.project_id,
      input.name,
      input.version ?? '1.0.0',
      input.description ?? null,
      input.directory,
      input.manifest,
      input.is_enabled !== false ? 1 : 0
    )

    return this.get(id) as Plugin
  },

  get(id: string): Plugin | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM plugins WHERE id = ?')
      .get(id) as RawPlugin | undefined
    return row ? mapPlugin(row) : null
  },

  getByName(projectId: string, name: string): Plugin | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM plugins WHERE project_id = ? AND name = ?')
      .get(projectId, name) as RawPlugin | undefined
    return row ? mapPlugin(row) : null
  },

  list(filters?: PluginFilters): Plugin[] {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.project_id) {
      conditions.push('project_id = ?')
      params.push(filters.project_id)
    }
    if (filters?.is_enabled !== undefined) {
      conditions.push('is_enabled = ?')
      params.push(filters.is_enabled ? 1 : 0)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db
      .prepare(
        `SELECT * FROM plugins ${whereClause} ORDER BY installed_at DESC`
      )
      .all(...params) as RawPlugin[]

    return rows.map(mapPlugin)
  },

  update(id: string, input: UpdatePluginInput): Plugin | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.is_enabled !== undefined) {
      fields.push('is_enabled = ?')
      params.push(input.is_enabled ? 1 : 0)
    }
    if (input.version !== undefined) {
      fields.push('version = ?')
      params.push(input.version)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      params.push(input.description)
    }
    if (input.directory !== undefined) {
      fields.push('directory = ?')
      params.push(input.directory)
    }
    if (input.manifest !== undefined) {
      fields.push('manifest = ?')
      params.push(input.manifest)
    }

    if (fields.length === 0) return this.get(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE plugins SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.get(id)
  },

  delete(id: string): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM plugins WHERE id = ?').run(id)
    return result.changes > 0
  },

  enable(id: string): void {
    const db = getDatabase()
    db.prepare("UPDATE plugins SET is_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(id)
  },

  disable(id: string): void {
    const db = getDatabase()
    db.prepare("UPDATE plugins SET is_enabled = 0, updated_at = datetime('now') WHERE id = ?").run(id)
  },
}
