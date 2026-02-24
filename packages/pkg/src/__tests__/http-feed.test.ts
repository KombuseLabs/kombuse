import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HttpFeed } from '../feed/http-feed'
import type { HttpPackageIndex } from '../feed/http-feed'
import { FeedError } from '../errors'

function makeIndex(
  packages: HttpPackageIndex['packages']
): HttpPackageIndex {
  return { packages }
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers(),
    body: null,
  } as unknown as Response
}

describe('HttpFeed', () => {
  let feed: HttpFeed
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    feed = new HttpFeed({ baseUrl: 'https://registry.example.com' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listPackages', () => {
    it('should return latest version of each package', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a-1.0.0.tar.gz',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
                '2.0.0': {
                  url: 'https://dl/a-2.0.0.tar.gz',
                  manifest: { name: 'pkg-a', version: '2.0.0', type: 'app' },
                },
              },
            },
            'pkg-b': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/b-1.0.0.tar.gz',
                  manifest: { name: 'pkg-b', version: '1.0.0', type: 'plugin' },
                },
              },
            },
          })
        )
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(2)
      const names = packages.map((p) => p.name)
      expect(names).toContain('pkg-a')
      expect(names).toContain('pkg-b')

      const pkgA = packages.find((p) => p.name === 'pkg-a')!
      expect(pkgA.version).toBe('2.0.0')
    })

    it('should skip invalid semver versions', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a-1.0.0.tar.gz',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
                latest: {
                  url: 'https://dl/a-latest.tar.gz',
                  manifest: { name: 'pkg-a', version: 'latest', type: 'app' },
                },
              },
            },
          })
        )
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.version).toBe('1.0.0')
    })
  })

  describe('getVersions', () => {
    it('should return all versions sorted descending', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a-1.tar.gz',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
                '3.0.0': {
                  url: 'https://dl/a-3.tar.gz',
                  manifest: { name: 'pkg-a', version: '3.0.0', type: 'app' },
                },
                '2.0.0': {
                  url: 'https://dl/a-2.tar.gz',
                  manifest: { name: 'pkg-a', version: '2.0.0', type: 'app' },
                },
              },
            },
          })
        )
      )

      const versions = await feed.getVersions('pkg-a')

      expect(versions.map((v) => v.version)).toEqual([
        '3.0.0',
        '2.0.0',
        '1.0.0',
      ])
    })

    it('should return empty for unknown package', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeIndex({}))
      )

      const versions = await feed.getVersions('unknown')

      expect(versions).toEqual([])
    })

    it('should include checksum and publishedAt when present', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a.tar.gz',
                  checksum: 'abc123',
                  publishedAt: '2026-01-01',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
              },
            },
          })
        )
      )

      const versions = await feed.getVersions('pkg-a')

      expect(versions[0]!.checksum).toBe('abc123')
      expect(versions[0]!.publishedAt).toBe('2026-01-01')
    })
  })

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a.tar.gz',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
                '2.0.0': {
                  url: 'https://dl/a2.tar.gz',
                  manifest: { name: 'pkg-a', version: '2.0.0', type: 'app' },
                },
              },
            },
          })
        )
      )

      const result = await feed.getVersion('pkg-a', '1.0.0')

      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.0.0')
    })

    it('should return null for missing version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeIndex({
            'pkg-a': {
              versions: {
                '1.0.0': {
                  url: 'https://dl/a.tar.gz',
                  manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
                },
              },
            },
          })
        )
      )

      const result = await feed.getVersion('pkg-a', '9.9.9')

      expect(result).toBeNull()
    })
  })

  describe('caching', () => {
    it('should fetch index only once across multiple calls', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeIndex({}))
      )

      await feed.listPackages()
      await feed.listPackages()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should re-fetch after clearCache()', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeIndex({}))
      )

      await feed.listPackages()
      feed.clearCache()
      await feed.listPackages()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('auth', () => {
    it('should include auth header when configured', async () => {
      const authedFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
        auth: { token: 'secret-token', type: 'Bearer' },
      })

      fetchMock.mockResolvedValue(
        mockJsonResponse(makeIndex({}))
      )

      await authedFeed.listPackages()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token',
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('should throw FeedError on non-200 response', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 500))

      await expect(feed.listPackages()).rejects.toThrow(FeedError)
    })

    it('should throw FeedError on 404', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 404))

      await expect(feed.listPackages()).rejects.toThrow(FeedError)
    })
  })

  describe('download', () => {
    it('should throw FeedError when downloadUrl is missing', async () => {
      await expect(
        feed.download(
          {
            name: 'pkg-a',
            version: '1.0.0',
            manifest: { name: 'pkg-a', version: '1.0.0', type: 'app' },
          },
          '/tmp/dest'
        )
      ).rejects.toThrow(FeedError)
    })
  })

  describe('cache TTL', () => {
    let fetchMockTtl: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vi.useFakeTimers()
      fetchMockTtl = vi.fn()
      vi.stubGlobal('fetch', fetchMockTtl)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should re-fetch after TTL expires', async () => {
      const ttlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
        cacheTtlMs: 5000,
      })

      fetchMockTtl.mockResolvedValue(mockJsonResponse(makeIndex({})))

      await ttlFeed.listPackages()
      await ttlFeed.listPackages()
      expect(fetchMockTtl).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5001)

      await ttlFeed.listPackages()
      expect(fetchMockTtl).toHaveBeenCalledTimes(2)
    })

    it('should return cached data within TTL window', async () => {
      const ttlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
        cacheTtlMs: 5000,
      })

      fetchMockTtl.mockResolvedValue(mockJsonResponse(makeIndex({})))

      await ttlFeed.listPackages()
      vi.advanceTimersByTime(3000)
      await ttlFeed.listPackages()

      expect(fetchMockTtl).toHaveBeenCalledTimes(1)
    })

    it('should never expire cache when cacheTtlMs is not set', async () => {
      const noTtlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
      })

      fetchMockTtl.mockResolvedValue(mockJsonResponse(makeIndex({})))

      await noTtlFeed.listPackages()
      vi.advanceTimersByTime(999_999_999)
      await noTtlFeed.listPackages()

      expect(fetchMockTtl).toHaveBeenCalledTimes(1)
    })

    it('should re-fetch after clearCache regardless of TTL', async () => {
      const ttlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
        cacheTtlMs: 60_000,
      })

      fetchMockTtl.mockResolvedValue(mockJsonResponse(makeIndex({})))

      await ttlFeed.listPackages()
      ttlFeed.clearCache()
      await ttlFeed.listPackages()

      expect(fetchMockTtl).toHaveBeenCalledTimes(2)
    })
  })

  describe('url handling', () => {
    it('should strip trailing slashes from baseUrl', async () => {
      const trailingSlashFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com///',
      })

      fetchMock.mockResolvedValue(
        mockJsonResponse(makeIndex({}))
      )

      await trailingSlashFeed.listPackages()

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.example.com/index.json',
        expect.any(Object)
      )
    })
  })
})
