import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HttpFeed } from '../feed/http-feed'
import { FeedError } from '../errors'

function makePluginListResponse(
  plugins: Array<{ author: string; name: string; latest_version: string | null }>
) {
  return {
    plugins: plugins.map((p, i) => ({
      id: `id-${i}`,
      author: p.author,
      name: p.name,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      latest_version: p.latest_version,
    })),
  }
}

function makeVersionsResponse(
  versions: Array<{
    version: string
    channel?: string
    download_url: string
    published_at?: string
  }>
) {
  return {
    versions: versions.map((v) => ({
      version: v.version,
      channel: v.channel ?? 'stable',
      type: 'plugin',
      archive_size: 1024,
      manifest: {
        author: 'test-author',
        name: 'test-pkg',
        version: v.version,
        type: 'plugin',
      },
      published_at: v.published_at ?? '2026-01-01T00:00:00Z',
      download_url: v.download_url,
    })),
  }
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
    it('should return latest version of each plugin', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makePluginListResponse([
            { author: 'acme', name: 'pkg-a', latest_version: '2.0.0' },
            { author: 'acme', name: 'pkg-b', latest_version: '1.0.0' },
          ])
        )
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(2)
      expect(packages[0]!.name).toBe('acme/pkg-a')
      expect(packages[0]!.version).toBe('2.0.0')
      expect(packages[1]!.name).toBe('acme/pkg-b')
      expect(packages[1]!.version).toBe('1.0.0')
    })

    it('should skip plugins with null latest_version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makePluginListResponse([
            { author: 'acme', name: 'pkg-a', latest_version: '1.0.0' },
            { author: 'acme', name: 'pkg-b', latest_version: null },
          ])
        )
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.name).toBe('acme/pkg-a')
    })

    it('should skip plugins with invalid semver latest_version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makePluginListResponse([
            { author: 'acme', name: 'pkg-a', latest_version: '1.0.0' },
            { author: 'acme', name: 'pkg-b', latest_version: 'latest' },
          ])
        )
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
    })

    it('should set archiveFormat to tar.gz', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makePluginListResponse([
            { author: 'acme', name: 'pkg-a', latest_version: '1.0.0' },
          ])
        )
      )

      const packages = await feed.listPackages()

      expect(packages[0]!.archiveFormat).toBe('tar.gz')
    })

    it('should set manifest with author', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makePluginListResponse([
            { author: 'acme', name: 'pkg-a', latest_version: '1.0.0' },
          ])
        )
      )

      const packages = await feed.listPackages()

      expect(packages[0]!.manifest.author).toBe('acme')
      expect(packages[0]!.manifest.type).toBe('plugin')
    })

    it('should call GET /api/plugins', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await feed.listPackages()

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.example.com/api/plugins',
        expect.any(Object)
      )
    })
  })

  describe('getVersions', () => {
    it('should return all versions sorted descending', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/api/plugins/acme/pkg/versions/1.0.0/download' },
            { version: '3.0.0', download_url: '/api/plugins/acme/pkg/versions/3.0.0/download' },
            { version: '2.0.0', download_url: '/api/plugins/acme/pkg/versions/2.0.0/download' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions.map((v) => v.version)).toEqual(['3.0.0', '2.0.0', '1.0.0'])
    })

    it('should resolve relative download URLs against baseUrl', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/api/plugins/acme/pkg/versions/1.0.0/download' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions[0]!.downloadUrl).toBe(
        'https://registry.example.com/api/plugins/acme/pkg/versions/1.0.0/download'
      )
    })

    it('should keep absolute download URLs as-is', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: 'https://cdn.example.com/pkg-1.0.0.tar.gz' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions[0]!.downloadUrl).toBe('https://cdn.example.com/pkg-1.0.0.tar.gz')
    })

    it('should call GET /api/plugins/{author}/{name}/versions', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeVersionsResponse([]))
      )

      await feed.getVersions('acme/test-pkg')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.example.com/api/plugins/acme/test-pkg/versions',
        expect.any(Object)
      )
    })

    it('should skip invalid semver versions', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/dl/1' },
            { version: 'latest', download_url: '/dl/latest' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.version).toBe('1.0.0')
    })

    it('should include publishedAt', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/dl/1', published_at: '2026-02-01T00:00:00Z' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions[0]!.publishedAt).toBe('2026-02-01T00:00:00Z')
    })

    it('should set archiveFormat to tar.gz', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/dl/1' },
          ])
        )
      )

      const versions = await feed.getVersions('acme/pkg')

      expect(versions[0]!.archiveFormat).toBe('tar.gz')
    })

    it('should throw FeedError for non-compound package name', async () => {
      await expect(feed.getVersions('simple-name')).rejects.toThrow(FeedError)
    })
  })

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/dl/1' },
            { version: '2.0.0', download_url: '/dl/2' },
          ])
        )
      )

      const result = await feed.getVersion('acme/pkg', '1.0.0')

      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.0.0')
    })

    it('should return null for missing version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          makeVersionsResponse([
            { version: '1.0.0', download_url: '/dl/1' },
          ])
        )
      )

      const result = await feed.getVersion('acme/pkg', '9.9.9')

      expect(result).toBeNull()
    })
  })

  describe('caching', () => {
    it('should fetch plugin list only once across multiple calls', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await feed.listPackages()
      await feed.listPackages()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should cache getVersions per package', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeVersionsResponse([]))
      )

      await feed.getVersions('acme/pkg-a')
      await feed.getVersions('acme/pkg-a')

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should fetch separately for different packages', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeVersionsResponse([]))
      )

      await feed.getVersions('acme/pkg-a')
      await feed.getVersions('acme/pkg-b')

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after clearCache()', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await feed.listPackages()
      feed.clearCache()
      await feed.listPackages()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should clear version cache on clearCache()', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(makeVersionsResponse([]))
      )

      await feed.getVersions('acme/pkg')
      feed.clearCache()
      await feed.getVersions('acme/pkg')

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
        mockJsonResponse(makePluginListResponse([]))
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
            name: 'acme/pkg',
            version: '1.0.0',
            manifest: { name: 'pkg', version: '1.0.0', type: 'plugin' },
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

      fetchMockTtl.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

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

      fetchMockTtl.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await ttlFeed.listPackages()
      vi.advanceTimersByTime(3000)
      await ttlFeed.listPackages()

      expect(fetchMockTtl).toHaveBeenCalledTimes(1)
    })

    it('should never expire cache when cacheTtlMs is not set', async () => {
      const noTtlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
      })

      fetchMockTtl.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

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

      fetchMockTtl.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await ttlFeed.listPackages()
      ttlFeed.clearCache()
      await ttlFeed.listPackages()

      expect(fetchMockTtl).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch versions after TTL expires', async () => {
      const ttlFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com',
        cacheTtlMs: 5000,
      })

      fetchMockTtl.mockResolvedValue(
        mockJsonResponse(makeVersionsResponse([]))
      )

      await ttlFeed.getVersions('acme/pkg')
      vi.advanceTimersByTime(5001)
      await ttlFeed.getVersions('acme/pkg')

      expect(fetchMockTtl).toHaveBeenCalledTimes(2)
    })
  })

  describe('url handling', () => {
    it('should strip trailing slashes from baseUrl', async () => {
      const trailingSlashFeed = new HttpFeed({
        baseUrl: 'https://registry.example.com///',
      })

      fetchMock.mockResolvedValue(
        mockJsonResponse(makePluginListResponse([]))
      )

      await trailingSlashFeed.listPackages()

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.example.com/api/plugins',
        expect.any(Object)
      )
    })
  })
})
