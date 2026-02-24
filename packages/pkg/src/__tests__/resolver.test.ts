import { describe, it, expect } from 'vitest'
import type { FeedProvider, PackageVersionInfo } from '../types'
import type { PkgManifest } from '@kombuse/types'
import { VersionResolver } from '../version/resolver'

function makeVersionInfo(
  name: string,
  version: string
): PackageVersionInfo {
  return {
    name,
    version,
    manifest: { name, version, type: 'plugin' } satisfies PkgManifest,
  }
}

function mockFeed(
  id: string,
  versions: PackageVersionInfo[]
): FeedProvider {
  return {
    id,
    name: id,
    listPackages: async () => versions,
    getVersions: async () => versions,
    getVersion: async (_name, ver) =>
      versions.find((v) => v.version === ver) ?? null,
    download: async (_info, dest) => dest,
  }
}

function failingFeed(id: string): FeedProvider {
  return {
    id,
    name: id,
    listPackages: async () => {
      throw new Error('network error')
    },
    getVersions: async () => {
      throw new Error('network error')
    },
    getVersion: async () => {
      throw new Error('network error')
    },
    download: async () => {
      throw new Error('network error')
    },
  }
}

describe('VersionResolver', () => {
  const resolver = new VersionResolver()

  describe('resolveLatest', () => {
    it('should return null when no feeds', async () => {
      const result = await resolver.resolveLatest('pkg', [])
      expect(result).toBeNull()
    })

    it('should return null when all feeds return empty', async () => {
      const feed = mockFeed('empty', [])
      const result = await resolver.resolveLatest('pkg', [feed])
      expect(result).toBeNull()
    })

    it('should return the newest version across feeds', async () => {
      const feedA = mockFeed('a', [
        makeVersionInfo('pkg', '1.5.0'),
        makeVersionInfo('pkg', '1.0.0'),
      ])
      const feedB = mockFeed('b', [
        makeVersionInfo('pkg', '2.0.0'),
        makeVersionInfo('pkg', '1.8.0'),
      ])

      const result = await resolver.resolveLatest('pkg', [feedA, feedB])

      expect(result).not.toBeNull()
      expect(result!.info.version).toBe('2.0.0')
      expect(result!.feedId).toBe('b')
    })

    it('should handle feed errors gracefully', async () => {
      const goodFeed = mockFeed('good', [makeVersionInfo('pkg', '1.0.0')])
      const badFeed = failingFeed('bad')

      const result = await resolver.resolveLatest('pkg', [
        badFeed,
        goodFeed,
      ])

      expect(result).not.toBeNull()
      expect(result!.info.version).toBe('1.0.0')
      expect(result!.feedId).toBe('good')
    })
  })

  describe('checkForUpdates', () => {
    it('should return null when no feeds', async () => {
      const result = await resolver.checkForUpdates('pkg', '1.0.0', [])
      expect(result).toBeNull()
    })

    it('should return null when current is latest', async () => {
      const feed = mockFeed('a', [makeVersionInfo('pkg', '1.0.0')])
      const result = await resolver.checkForUpdates('pkg', '1.0.0', [feed])
      expect(result).toBeNull()
    })

    it('should return update info when newer version exists', async () => {
      const feed = mockFeed('a', [
        makeVersionInfo('pkg', '2.0.0'),
        makeVersionInfo('pkg', '1.0.0'),
      ])

      const result = await resolver.checkForUpdates('pkg', '1.0.0', [feed])

      expect(result).not.toBeNull()
      expect(result!.info.version).toBe('2.0.0')
    })

    it('should return null when current is newer than feed', async () => {
      const feed = mockFeed('a', [makeVersionInfo('pkg', '1.0.0')])
      const result = await resolver.checkForUpdates('pkg', '2.0.0', [feed])
      expect(result).toBeNull()
    })
  })
})
