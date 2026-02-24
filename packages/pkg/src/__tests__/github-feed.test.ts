import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GitHubFeed } from '../feed/github-feed'
import { FeedError } from '../errors'

interface MockRelease {
  tag_name: string
  name: string | null
  body: string | null
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: Array<{
    name: string
    size: number
    browser_download_url: string
    url: string
  }>
}

function makeRelease(
  tag: string,
  options?: {
    draft?: boolean
    prerelease?: boolean
    assets?: Array<{ name: string; browser_download_url: string }>
  }
): MockRelease {
  return {
    tag_name: tag,
    name: `Release ${tag}`,
    body: null,
    published_at: '2026-01-01T00:00:00Z',
    draft: options?.draft ?? false,
    prerelease: options?.prerelease ?? false,
    assets: (options?.assets ?? [{ name: 'app.tar.gz', browser_download_url: `https://github.com/dl/${tag}/app.tar.gz` }]).map((a) => ({
      ...a,
      size: 1024,
      url: `https://api.github.com/repos/owner/repo/releases/assets/123`,
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

describe('GitHubFeed', () => {
  let feed: GitHubFeed
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    feed = new GitHubFeed({
      repo: 'owner/repo',
      packageName: 'my-pkg',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getVersions', () => {
    it('should parse releases and extract versions', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v2.0.0'),
          makeRelease('v1.0.0'),
        ])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions).toHaveLength(2)
      expect(versions[0]!.version).toBe('2.0.0')
      expect(versions[1]!.version).toBe('1.0.0')
    })

    it('should strip v prefix from tag names', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([makeRelease('v1.2.3')])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions[0]!.version).toBe('1.2.3')
    })

    it('should handle tags without v prefix', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([makeRelease('1.0.0')])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.version).toBe('1.0.0')
    })

    it('should filter out drafts and prereleases', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v1.0.0'),
          makeRelease('v2.0.0-rc.1', { draft: true }),
          makeRelease('v2.0.0-beta', { prerelease: true }),
        ])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.version).toBe('1.0.0')
    })

    it('should skip tags with invalid semver', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v1.0.0'),
          makeRelease('latest'),
          makeRelease('nightly-2026'),
        ])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.version).toBe('1.0.0')
    })

    it('should match assets against assetPattern', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v1.0.0', {
            assets: [
              { name: 'app.zip', browser_download_url: 'https://dl/app.zip' },
              { name: 'app.tar.gz', browser_download_url: 'https://dl/app.tar.gz' },
            ],
          }),
        ])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions[0]!.downloadUrl).toBe('https://dl/app.tar.gz')
    })

    it('should return empty when packageName does not match', async () => {
      const versions = await feed.getVersions('other-pkg')

      expect(versions).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should handle empty release list', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse([]))

      const versions = await feed.getVersions('my-pkg')

      expect(versions).toEqual([])
    })

    it('should set downloadUrl to undefined when no asset matches pattern', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v1.0.0', {
            assets: [
              { name: 'app.zip', browser_download_url: 'https://dl/app.zip' },
            ],
          }),
        ])
      )

      const versions = await feed.getVersions('my-pkg')

      expect(versions[0]!.downloadUrl).toBeUndefined()
    })
  })

  describe('listPackages', () => {
    it('should return only the latest version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v2.0.0'),
          makeRelease('v1.0.0'),
        ])
      )

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.version).toBe('2.0.0')
    })
  })

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v2.0.0'),
          makeRelease('v1.0.0'),
        ])
      )

      const result = await feed.getVersion('my-pkg', '1.0.0')

      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.0.0')
    })

    it('should return null for non-existent version', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse([makeRelease('v1.0.0')])
      )

      const result = await feed.getVersion('my-pkg', '9.9.9')

      expect(result).toBeNull()
    })
  })

  describe('download', () => {
    it('should throw FeedError when downloadUrl is missing', async () => {
      await expect(
        feed.download(
          {
            name: 'my-pkg',
            version: '1.0.0',
            manifest: { name: 'my-pkg', version: '1.0.0', type: 'app' },
          },
          '/tmp/dest'
        )
      ).rejects.toThrow(FeedError)
    })
  })

  describe('auth', () => {
    it('should include auth header in API requests', async () => {
      const authedFeed = new GitHubFeed({
        repo: 'owner/repo',
        packageName: 'my-pkg',
        auth: { token: 'gh-token-123' },
      })

      fetchMock.mockResolvedValue(mockJsonResponse([]))

      await authedFeed.getVersions('my-pkg')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer gh-token-123',
          }),
        })
      )
    })

    it('should use custom auth type when specified', async () => {
      const authedFeed = new GitHubFeed({
        repo: 'owner/repo',
        packageName: 'my-pkg',
        auth: { token: 'gh-token', type: 'token' },
      })

      fetchMock.mockResolvedValue(mockJsonResponse([]))

      await authedFeed.getVersions('my-pkg')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token gh-token',
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('should throw FeedError on non-200 API response', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 403))

      await expect(feed.getVersions('my-pkg')).rejects.toThrow(FeedError)
    })

    it('should throw FeedError on 404', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 404))

      await expect(feed.getVersions('my-pkg')).rejects.toThrow(FeedError)
    })
  })

  describe('configuration', () => {
    it('should use custom apiBase', async () => {
      const customFeed = new GitHubFeed({
        repo: 'owner/repo',
        packageName: 'my-pkg',
        apiBase: 'https://git.example.com/api/v3',
      })

      fetchMock.mockResolvedValue(mockJsonResponse([]))

      await customFeed.getVersions('my-pkg')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://git.example.com/api/v3/repos/owner/repo/releases'),
        expect.any(Object)
      )
    })

    it('should use custom assetPattern', async () => {
      const customFeed = new GitHubFeed({
        repo: 'owner/repo',
        packageName: 'my-pkg',
        assetPattern: /\.zip$/,
      })

      fetchMock.mockResolvedValue(
        mockJsonResponse([
          makeRelease('v1.0.0', {
            assets: [
              { name: 'app.zip', browser_download_url: 'https://dl/app.zip' },
              { name: 'app.tar.gz', browser_download_url: 'https://dl/app.tar.gz' },
            ],
          }),
        ])
      )

      const versions = await customFeed.getVersions('my-pkg')

      expect(versions[0]!.downloadUrl).toBe('https://dl/app.zip')
    })
  })
})
