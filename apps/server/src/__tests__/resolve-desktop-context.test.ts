import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '@kombuse/persistence'
import { resolveDesktopContext } from '../services/agent-execution-service/chat-session-runner'

describe('resolveDesktopContext', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'desktop-context-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns docs_db_exists: false when file does not exist', () => {
    const result = resolveDesktopContext(join(tempDir, 'nonexistent.db'))
    expect(result).toEqual({
      docs_db_exists: false,
      docs_db_project_count: 0,
      docs_db_ticket_count: 0,
      demo_project_id: null,
    })
  })

  it('returns demo_project_id when demo-project exists', () => {
    const dbPath = join(tempDir, 'docs.db')
    const db = new Database(dbPath)
    runMigrations(db)

    db.prepare(`INSERT INTO profiles (id, type, name) VALUES ('owner', 'user', 'Owner')`).run()
    db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES ('demo-project', 'Acme Project', 'owner')`).run()
    db.prepare(`INSERT INTO tickets (project_id, author_id, title, status) VALUES ('demo-project', 'owner', 'Test Ticket', 'open')`).run()
    db.close()

    const result = resolveDesktopContext(dbPath)
    expect(result).toEqual({
      docs_db_exists: true,
      docs_db_project_count: 1,
      docs_db_ticket_count: 1,
      demo_project_id: 'demo-project',
    })
  })

  it('returns demo_project_id: null when DB has no demo project', () => {
    const dbPath = join(tempDir, 'docs.db')
    const db = new Database(dbPath)
    runMigrations(db)

    db.prepare(`INSERT INTO profiles (id, type, name) VALUES ('owner', 'user', 'Owner')`).run()
    db.prepare(`INSERT INTO projects (id, name, owner_id) VALUES ('other-project', 'Other', 'owner')`).run()
    db.close()

    const result = resolveDesktopContext(dbPath)
    expect(result).toEqual({
      docs_db_exists: true,
      docs_db_project_count: 1,
      docs_db_ticket_count: 0,
      demo_project_id: null,
    })
  })

  it('returns zero counts when DB file exists but is corrupt', () => {
    const dbPath = join(tempDir, 'docs.db')
    writeFileSync(dbPath, 'not a sqlite database')

    const result = resolveDesktopContext(dbPath)
    expect(result).toEqual({
      docs_db_exists: true,
      docs_db_project_count: 0,
      docs_db_ticket_count: 0,
      demo_project_id: null,
    })
  })
})
