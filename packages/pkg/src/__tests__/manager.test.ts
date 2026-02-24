import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PkgManifest } from '@kombuse/types'
import type { FeedProvider, PackageVersionInfo, DownloadProgress } from '../types'
import { PackageManager } from '../manager'
import { VersionNotFoundError } from '../errors'
import { FilesystemFeed } from '../feed/filesystem-feed'

function writeManifest(dir: string, manifest: PkgManifest): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
}

function mockFeed(
  id: string,
  packages: PackageVersionInfo[],
  downloadDir?: string
): FeedProvider {
  return {
    id,
    name: id,
    listPackages: async () => packages,
    getVersions: async (name) =>
      packages.filter((p) => p.name === name),
    getVersion: async (name, ver) =>
      packages.find((p) => p.name === name && p.version === ver) ?? null,
    download: async (info, dest, onProgress) => {
      if (downloadDir) {
        const source = join(downloadDir, `${info.name}-${info.version}.tar.gz`)
        if (existsSync(source)) {
          const { copyFileSync } = await import('node:fs')
          copyFileSync(source, dest)
        } else {
          writeFileSync(dest, `package-${info.name}-${info.version}`)
        }
      } else {
        writeFileSync(dest, `package-${info.name}-${info.version}`)
      }
      onProgress?.({
        phase: 'downloading',
        percent: 100,
        bytesDownloaded: 0,
        bytesTotal: 0,
      })
      return dest
    },
  }
}

describe('PackageManager', () => {
  let tempDir: string
  let cacheDir: string
  let sourceDir: string
  let manager: PackageManager

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-manager-'))
    cacheDir = join(tempDir, 'cache')
    sourceDir = join(tempDir, 'source')
    mkdirSync(sourceDir, { recursive: true })
    manager = new PackageManager({ cacheDir, maxCachedVersions: 3 })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('feed management', () => {
    it('should register and list feeds', () => {
      const feed = mockFeed('test-feed', [])
      manager.addFeed(feed)

      expect(manager.getFeeds()).toHaveLength(1)
      expect(manager.getFeeds()[0]!.id).toBe('test-feed')
    })

    it('should remove a feed by id', () => {
      const feed = mockFeed('test-feed', [])
      manager.addFeed(feed)

      expect(manager.removeFeed('test-feed')).toBe(true)
      expect(manager.getFeeds()).toHaveLength(0)
    })

    it('should return false for unknown feed id', () => {
      expect(manager.removeFeed('unknown')).toBe(false)
    })
  })

  describe('checkForUpdates', () => {
    it('should return hasUpdate: false with no feeds', async () => {
      const result = await manager.checkForUpdates('pkg', '1.0.0')
      expect(result.hasUpdate).toBe(false)
      expect(result.latest).toBeNull()
    })

    it('should return hasUpdate: true when newer version exists', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'pkg',
          version: '2.0.0',
          manifest: { name: 'pkg', version: '2.0.0', type: 'app' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.checkForUpdates('pkg', '1.0.0')

      expect(result.hasUpdate).toBe(true)
      expect(result.latest!.version).toBe('2.0.0')
    })

    it('should return hasUpdate: false when current is latest', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'pkg',
          version: '1.0.0',
          manifest: { name: 'pkg', version: '1.0.0', type: 'app' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.checkForUpdates('pkg', '1.0.0')

      expect(result.hasUpdate).toBe(false)
    })
  })

  describe('install', () => {
    it('should download and cache a package', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'my-app',
          version: '1.0.0',
          manifest: { name: 'my-app', version: '1.0.0', type: 'app' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.install('my-app', '1.0.0')

      expect(result.version).toBe('1.0.0')
      expect(result.manifest.name).toBe('my-app')
      expect(existsSync(result.cachePath)).toBe(true)
    })

    it('should return cached result on second install', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'my-app',
          version: '1.0.0',
          manifest: { name: 'my-app', version: '1.0.0', type: 'app' },
        },
      ]
      let downloadCount = 0
      const feed: FeedProvider = {
        ...mockFeed('a', versions),
        download: async (info, dest, onProgress) => {
          downloadCount++
          writeFileSync(dest, `data-${info.version}`)
          onProgress?.({
            phase: 'downloading',
            percent: 100,
            bytesDownloaded: 0,
            bytesTotal: 0,
          })
          return dest
        },
      }
      manager.addFeed(feed)

      await manager.install('my-app', '1.0.0')
      await manager.install('my-app', '1.0.0')

      expect(downloadCount).toBe(1)
    })

    it('should throw VersionNotFoundError for missing package', async () => {
      await expect(
        manager.install('nonexistent', '1.0.0')
      ).rejects.toThrow(VersionNotFoundError)
    })

    it('should call progress callback', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'my-app',
          version: '1.0.0',
          manifest: { name: 'my-app', version: '1.0.0', type: 'app' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const phases: string[] = []
      await manager.install('my-app', '1.0.0', (p: DownloadProgress) => {
        phases.push(p.phase)
      })

      expect(phases).toContain('downloading')
      expect(phases).toContain('caching')
    })

    it('should auto-prune when exceeding maxCachedVersions', async () => {
      const allVersions = ['1.0.0', '2.0.0', '3.0.0', '4.0.0']
      for (const v of allVersions) {
        const versions: PackageVersionInfo[] = [
          {
            name: 'my-app',
            version: v,
            manifest: { name: 'my-app', version: v, type: 'app' },
          },
        ]
        manager.addFeed(mockFeed(`feed-${v}`, versions))
      }

      for (const v of allVersions) {
        await manager.install('my-app', v)
      }

      // maxCachedVersions is 3, so oldest should be pruned
      const cache = manager.getCache()
      const remaining = await cache.list('my-app')
      expect(remaining.length).toBeLessThanOrEqual(3)
      expect(remaining.map((e) => e.version)).toContain('4.0.0')
      expect(remaining.map((e) => e.version)).toContain('3.0.0')
    })
  })

  describe('installLatest', () => {
    it('should install the latest version from feeds', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'my-app',
          version: '3.0.0',
          manifest: { name: 'my-app', version: '3.0.0', type: 'app' },
        },
        {
          name: 'my-app',
          version: '2.0.0',
          manifest: { name: 'my-app', version: '2.0.0', type: 'app' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.installLatest('my-app')

      expect(result.version).toBe('3.0.0')
    })

    it('should throw when no versions available', async () => {
      manager.addFeed(mockFeed('empty', []))

      await expect(manager.installLatest('my-app')).rejects.toThrow(
        VersionNotFoundError
      )
    })
  })

  describe('search', () => {
    it('should return all packages when no query', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'alpha',
          version: '1.0.0',
          manifest: { name: 'alpha', version: '1.0.0', type: 'app' },
        },
        {
          name: 'beta',
          version: '1.0.0',
          manifest: { name: 'beta', version: '1.0.0', type: 'plugin' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.search()

      expect(result).toHaveLength(2)
    })

    it('should filter by name', async () => {
      const versions: PackageVersionInfo[] = [
        {
          name: 'alpha-tool',
          version: '1.0.0',
          manifest: { name: 'alpha-tool', version: '1.0.0', type: 'app' },
        },
        {
          name: 'beta-tool',
          version: '1.0.0',
          manifest: { name: 'beta-tool', version: '1.0.0', type: 'plugin' },
        },
      ]
      manager.addFeed(mockFeed('a', versions))

      const result = await manager.search('alpha')

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('alpha-tool')
    })
  })

  describe('integration with FilesystemFeed', () => {
    it('should install from filesystem feed', async () => {
      const feedDir = join(tempDir, 'packages')
      const pkgDir = join(feedDir, 'test-plugin', '1.0.0')
      writeManifest(pkgDir, {
        name: 'test-plugin',
        version: '1.0.0',
        type: 'plugin',
        description: 'A test plugin',
      })
      writeFileSync(join(pkgDir, 'plugin.js'), 'console.log("hello")')

      const feed = new FilesystemFeed({ directory: feedDir })
      manager.addFeed(feed)

      const result = await manager.install('test-plugin', '1.0.0')

      expect(result.version).toBe('1.0.0')
      expect(result.manifest.type).toBe('plugin')
      expect(existsSync(result.cachePath)).toBe(true)
    })
  })
})
