import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { loadKombuseConfig, getKombuseDir, resolveDbPath } from '../config.repository'

describe('loadKombuseConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `kombuse-config-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return empty object when config file does not exist', () => {
    const config = loadKombuseConfig(join(tempDir, 'nonexistent.json'))
    expect(config).toEqual({})
  })

  it('should parse valid config with database.path', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ database: { path: '/custom/data.db' } }))

    const config = loadKombuseConfig(configPath)
    expect(config.database?.path).toBe('/custom/data.db')
  })

  it('should return empty object for malformed JSON', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, 'not valid json {{{')

    const config = loadKombuseConfig(configPath)
    expect(config).toEqual({})
  })

  it('should return empty object when JSON is an array', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, '[1, 2, 3]')

    const config = loadKombuseConfig(configPath)
    expect(config).toEqual({})
  })

  it('should return empty object when JSON is a string', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, '"hello"')

    const config = loadKombuseConfig(configPath)
    expect(config).toEqual({})
  })

  it('should return empty object when JSON is null', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, 'null')

    const config = loadKombuseConfig(configPath)
    expect(config).toEqual({})
  })

  it('should return config without database.path when database key is missing', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ other: 'value' }))

    const config = loadKombuseConfig(configPath)
    expect(config.database?.path).toBeUndefined()
  })

  it('should return config when database key exists but path is missing', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ database: {} }))

    const config = loadKombuseConfig(configPath)
    expect(config.database).toEqual({})
    expect(config.database?.path).toBeUndefined()
  })

  it('should handle empty file gracefully', () => {
    const configPath = join(tempDir, 'config.json')
    writeFileSync(configPath, '')

    const config = loadKombuseConfig(configPath)
    expect(config).toEqual({})
  })
})

describe('getKombuseDir', () => {
  it('should return a path ending with .kombuse', () => {
    const dir = getKombuseDir()
    expect(dir.endsWith('.kombuse')).toBe(true)
  })
})

describe('resolveDbPath', () => {
  it('should return an absolute path unchanged', () => {
    expect(resolveDbPath('/var/data/custom.db')).toBe('/var/data/custom.db')
  })

  it('should resolve a relative path against ~/.kombuse/', () => {
    const result = resolveDbPath('data/custom.db')
    expect(result).toBe(join(getKombuseDir(), 'data/custom.db'))
  })

  it('should resolve a dotdot path against ~/.kombuse/', () => {
    const result = resolveDbPath('../sibling/custom.db')
    const expected = resolve(getKombuseDir(), '../sibling/custom.db')
    expect(result).toBe(expected)
  })

  it('should resolve a bare filename against ~/.kombuse/', () => {
    const result = resolveDbPath('mydb.db')
    expect(result).toBe(join(getKombuseDir(), 'mydb.db'))
  })
})
