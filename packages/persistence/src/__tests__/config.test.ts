import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { loadKombuseConfig, loadProjectConfig, saveProjectConfig, getKombuseDir, resolveDbPath } from '../config.repository'

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

describe('saveProjectConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `kombuse-save-config-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should write and read back config with plugin sources', () => {
    const config = {
      plugins: {
        sources: [
          { type: 'filesystem' as const, path: '/my/plugins' },
          { type: 'github' as const, repo: 'owner/repo' },
        ],
      },
    }

    saveProjectConfig(tempDir, config)
    const loaded = loadProjectConfig(tempDir)

    expect(loaded.plugins?.sources).toEqual(config.plugins.sources)
  })

  it('should create .kombuse directory if it does not exist', () => {
    const projectDir = join(tempDir, 'new-project')
    mkdirSync(projectDir, { recursive: true })

    saveProjectConfig(projectDir, { plugins: { sources: [] } })

    expect(existsSync(join(projectDir, '.kombuse', 'config.json'))).toBe(true)
  })

  it('should overwrite existing config without corruption', () => {
    const firstConfig = {
      plugins: {
        sources: [{ type: 'filesystem' as const, path: '/first' }],
      },
    }
    const secondConfig = {
      plugins: {
        sources: [
          { type: 'github' as const, repo: 'owner/repo' },
          { type: 'http' as const, base_url: 'https://example.com' },
        ],
      },
    }

    saveProjectConfig(tempDir, firstConfig)
    saveProjectConfig(tempDir, secondConfig)

    const loaded = loadProjectConfig(tempDir)
    expect(loaded.plugins?.sources).toEqual(secondConfig.plugins.sources)
  })

  it('should write JSON with 2-space indentation and trailing newline', () => {
    const config = { plugins: { sources: [] } }

    saveProjectConfig(tempDir, config)

    const raw = readFileSync(join(tempDir, '.kombuse', 'config.json'), 'utf-8')
    expect(raw).toBe(JSON.stringify(config, null, 2) + '\n')
  })

  it('should preserve all config fields in roundtrip', () => {
    const config = {
      database: { path: '/data/my.db' },
      plugins: {
        sources: [{ type: 'filesystem' as const, path: '/plugins' }],
      },
    }

    saveProjectConfig(tempDir, config)
    const loaded = loadProjectConfig(tempDir)

    expect(loaded.database?.path).toBe('/data/my.db')
    expect(loaded.plugins?.sources).toEqual(config.plugins.sources)
  })
})

describe('loadProjectConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `kombuse-load-project-config-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return empty object when no config exists', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent'))
    expect(config).toEqual({})
  })

  it('should load config from .kombuse/config.json', () => {
    const kombuseDir = join(tempDir, '.kombuse')
    mkdirSync(kombuseDir, { recursive: true })
    writeFileSync(
      join(kombuseDir, 'config.json'),
      JSON.stringify({ database: { path: '/test.db' } })
    )

    const config = loadProjectConfig(tempDir)
    expect(config.database?.path).toBe('/test.db')
  })
})
