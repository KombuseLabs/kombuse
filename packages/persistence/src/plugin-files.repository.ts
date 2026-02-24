import { createHash } from 'node:crypto'
import type {
  PluginFile,
  CreatePluginFileInput,
  UpdatePluginFileInput,
} from '@kombuse/types'
import { getDatabase } from './database'

interface RawPluginFile {
  id: number
  plugin_id: string
  path: string
  content: string
  content_hash: string
  is_user_modified: number
  created_at: string
  updated_at: string
}

function mapPluginFile(row: RawPluginFile): PluginFile {
  return {
    id: row.id,
    plugin_id: row.plugin_id,
    path: row.path,
    content: row.content,
    content_hash: row.content_hash,
    is_user_modified: row.is_user_modified === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export const pluginFilesRepository = {
  list(pluginId: string): PluginFile[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM plugin_files WHERE plugin_id = ? ORDER BY path')
      .all(pluginId) as RawPluginFile[]
    return rows.map(mapPluginFile)
  },

  get(pluginId: string, path: string): PluginFile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM plugin_files WHERE plugin_id = ? AND path = ?')
      .get(pluginId, path) as RawPluginFile | undefined
    return row ? mapPluginFile(row) : null
  },

  getById(id: number): PluginFile | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM plugin_files WHERE id = ?')
      .get(id) as RawPluginFile | undefined
    return row ? mapPluginFile(row) : null
  },

  upsert(input: CreatePluginFileInput): PluginFile {
    const db = getDatabase()
    const contentHash = computeHash(input.content)

    db.prepare(
      `
      INSERT INTO plugin_files (plugin_id, path, content, content_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(plugin_id, path) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        updated_at = datetime('now')
      WHERE is_user_modified = 0
    `
    ).run(input.plugin_id, input.path, input.content, contentHash)

    return this.get(input.plugin_id, input.path) as PluginFile
  },

  update(id: number, input: UpdatePluginFileInput): PluginFile | null {
    const db = getDatabase()

    const fields: string[] = []
    const params: unknown[] = []

    if (input.content !== undefined) {
      fields.push('content = ?')
      params.push(input.content)
      fields.push('content_hash = ?')
      params.push(computeHash(input.content))
      // If content is updated and is_user_modified not explicitly set, mark as user-modified
      if (input.is_user_modified === undefined) {
        fields.push('is_user_modified = 1')
      }
    }
    if (input.is_user_modified !== undefined) {
      fields.push('is_user_modified = ?')
      params.push(input.is_user_modified ? 1 : 0)
    }

    if (fields.length === 0) return this.getById(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE plugin_files SET ${fields.join(', ')} WHERE id = ?`).run(
      ...params
    )

    return this.getById(id)
  },

  delete(id: number): boolean {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM plugin_files WHERE id = ?').run(id)
    return result.changes > 0
  },

  deleteByPlugin(pluginId: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM plugin_files WHERE plugin_id = ?')
      .run(pluginId)
    return result.changes
  },
}
