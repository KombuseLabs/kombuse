import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PkgManifest } from '@kombuse/types'
import { PackageCache } from '../cache/package-cache'

function makeManifest(
  name: string,
  version: string
): PkgManifest {
  return { name, version, type: 'plugin', description: 'test' }
}

function createTestArchive(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename)
  writeFileSync(filePath, content)
  return filePath
}

describe('PackageCache', () => {
  let tempDir: string
  let cacheDir: string
  let sourceDir: string
  let cache: PackageCache

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-cache-'))
    cacheDir = join(tempDir, 'cache')
    sourceDir = join(tempDir, 'source')
    const { mkdirSync } = require('node:fs')
    mkdirSync(sourceDir, { recursive: true })
    cache = new PackageCache(cacheDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('has', () => {
    it('should return false for non-existent package', async () => {
      expect(await cache.has('unknown', '1.0.0')).toBe(false)
    })

    it('should return true after put', async () => {
      const archive = createTestArchive(sourceDir, 'pkg.tar.gz', 'package-data')
      await cache.put('my-pkg', '1.0.0', archive, makeManifest('my-pkg', '1.0.0'))

      expect(await cache.has('my-pkg', '1.0.0')).toBe(true)
    })
  })

  describe('put + get', () => {
    it('should store and retrieve a cache entry', async () => {
      const archive = createTestArchive(sourceDir, 'pkg.tar.gz', 'data-v1')
      const manifest = makeManifest('my-pkg', '1.0.0')

      const entry = await cache.put('my-pkg', '1.0.0', archive, manifest)

      expect(entry.name).toBe('my-pkg')
      expect(entry.version).toBe('1.0.0')
      expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/)
      expect(entry.size).toBeGreaterThan(0)
      expect(entry.manifest).toEqual(manifest)
      expect(entry.cachedAt).toBeTruthy()

      const retrieved = await cache.get('my-pkg', '1.0.0')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.checksum).toBe(entry.checksum)
    })

    it('should return null for corrupted archive', async () => {
      const archive = createTestArchive(sourceDir, 'pkg.tar.gz', 'original')
      await cache.put('my-pkg', '1.0.0', archive, makeManifest('my-pkg', '1.0.0'))

      // Corrupt the cached content
      const cachedContent = join(cacheDir, 'my-pkg', '1.0.0', 'content')
      writeFileSync(cachedContent, 'tampered')

      expect(await cache.get('my-pkg', '1.0.0')).toBeNull()
    })
  })

  describe('remove', () => {
    it('should return false for non-existent version', async () => {
      expect(await cache.remove('my-pkg', '1.0.0')).toBe(false)
    })

    it('should remove a cached version and return true', async () => {
      const archive = createTestArchive(sourceDir, 'pkg.tar.gz', 'data')
      await cache.put('my-pkg', '1.0.0', archive, makeManifest('my-pkg', '1.0.0'))

      expect(await cache.remove('my-pkg', '1.0.0')).toBe(true)
      expect(await cache.has('my-pkg', '1.0.0')).toBe(false)
    })
  })

  describe('list', () => {
    it('should return empty array for unknown package', async () => {
      expect(await cache.list('unknown')).toEqual([])
    })

    it('should return entries sorted by semver descending', async () => {
      const versions = ['1.0.0', '2.1.0', '1.5.0', '2.0.0']
      for (const v of versions) {
        const archive = createTestArchive(sourceDir, `pkg-${v}.tar.gz`, `data-${v}`)
        await cache.put('my-pkg', v, archive, makeManifest('my-pkg', v))
      }

      const entries = await cache.list('my-pkg')
      const listed = entries.map((e) => e.version)

      expect(listed).toEqual(['2.1.0', '2.0.0', '1.5.0', '1.0.0'])
    })
  })

  describe('prune', () => {
    it('should remove oldest versions beyond keepCount', async () => {
      const versions = ['1.0.0', '2.0.0', '3.0.0', '4.0.0']
      for (const v of versions) {
        const archive = createTestArchive(sourceDir, `pkg-${v}.tar.gz`, `data-${v}`)
        await cache.put('my-pkg', v, archive, makeManifest('my-pkg', v))
      }

      const removed = await cache.prune('my-pkg', 2)

      expect(removed).toBe(2)
      const remaining = await cache.list('my-pkg')
      expect(remaining.map((e) => e.version)).toEqual(['4.0.0', '3.0.0'])
    })

    it('should return 0 when count is within limit', async () => {
      const archive = createTestArchive(sourceDir, 'pkg.tar.gz', 'data')
      await cache.put('my-pkg', '1.0.0', archive, makeManifest('my-pkg', '1.0.0'))

      expect(await cache.prune('my-pkg', 5)).toBe(0)
    })

    it('should return 0 for unknown package', async () => {
      expect(await cache.prune('unknown', 5)).toBe(0)
    })
  })
})
