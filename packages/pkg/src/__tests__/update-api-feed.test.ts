import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UpdateApiFeed } from '../feed/update-api-feed'
import { FeedError } from '../errors'

const VALID_CHECKSUM = 'a'.repeat(64)

function makeApiResponse(version = '1.2.0') {
  return {
    version,
    downloadUrl: '/api/updates/download/1.2.0',
    checksumUrl: '/api/updates/checksum/1.2.0',
    releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.2.0',
    releaseNotes: 'Bug fixes and improvements',
    publishedAt: '2026-02-01T00:00:00Z',
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

function mockTextResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => body,
    headers: new Headers(),
    body: null,
  } as unknown as Response
}

describe('UpdateApiFeed', () => {
  let feed: UpdateApiFeed
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    feed = new UpdateApiFeed({
      baseUrl: 'https://kombuse.dev',
      packageName: 'kombuse',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use default baseUrl and packageName', () => {
      const defaultFeed = new UpdateApiFeed()
      expect(defaultFeed.id).toBe('update-api:https://kombuse.dev')
      expect(defaultFeed.name).toBe('Update API (https://kombuse.dev)')
    })

    it('should strip trailing slashes from baseUrl', () => {
      const f = new UpdateApiFeed({ baseUrl: 'https://example.com/' })
      expect(f.id).toBe('update-api:https://example.com')
    })
  })

  describe('getVersions', () => {
    it('should fetch and map latest version', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(`${VALID_CHECKSUM}  package.tar.gz`))

      const versions = await feed.getVersions('kombuse')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.version).toBe('1.2.0')
      expect(versions[0]!.name).toBe('kombuse')
      expect(versions[0]!.downloadUrl).toBe('https://kombuse.dev/api/updates/download/1.2.0')
      expect(versions[0]!.checksum).toBe(VALID_CHECKSUM)
      expect(versions[0]!.publishedAt).toBe('2026-02-01T00:00:00Z')
      expect(versions[0]!.archiveFormat).toBe('tar.gz')
    })

    it('should store metadata in manifest', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const versions = await feed.getVersions('kombuse')
      const metadata = versions[0]!.manifest.metadata

      expect(metadata?.releaseUrl).toBe('https://github.com/owner/repo/releases/tag/v1.2.0')
      expect(metadata?.releaseNotes).toBe('Bug fixes and improvements')
      expect(metadata?.checksumUrl).toBe('https://kombuse.dev/api/updates/checksum/1.2.0')
    })

    it('should resolve relative URLs against baseUrl', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.downloadUrl).toBe('https://kombuse.dev/api/updates/download/1.2.0')
    })

    it('should preserve absolute URLs', async () => {
      const response = makeApiResponse()
      response.downloadUrl = 'https://cdn.example.com/package.tar.gz'
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(response))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.downloadUrl).toBe('https://cdn.example.com/package.tar.gz')
    })

    it('should return empty when packageName does not match', async () => {
      const versions = await feed.getVersions('other-pkg')

      expect(versions).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should return empty when API returns null/empty', async () => {
      fetchMock.mockResolvedValueOnce(mockJsonResponse(null))

      const versions = await feed.getVersions('kombuse')

      expect(versions).toEqual([])
    })

    it('should return empty when API returns no version field', async () => {
      fetchMock.mockResolvedValueOnce(mockJsonResponse({ other: 'data' }))

      const versions = await feed.getVersions('kombuse')

      expect(versions).toEqual([])
    })

    it('should set checksum to undefined when checksum URL fails', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse('', 404))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.checksum).toBeUndefined()
    })

    it('should set checksum to undefined when checksum format is invalid', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse('not-a-valid-hash'))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.checksum).toBeUndefined()
    })
  })

  describe('getVersion', () => {
    it('should return version info when version matches', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const result = await feed.getVersion('kombuse', '1.2.0')

      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.2.0')
    })

    it('should return null when version does not match', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const result = await feed.getVersion('kombuse', '9.9.9')

      expect(result).toBeNull()
    })

    it('should return null for wrong packageName', async () => {
      const result = await feed.getVersion('other-pkg', '1.2.0')

      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should return null when API returns empty', async () => {
      fetchMock.mockResolvedValueOnce(mockJsonResponse(null))

      const result = await feed.getVersion('kombuse', '1.2.0')

      expect(result).toBeNull()
    })
  })

  describe('listPackages', () => {
    it('should return latest version as single-element array', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.version).toBe('1.2.0')
    })
  })

  describe('download', () => {
    it('should throw FeedError when downloadUrl is missing', async () => {
      await expect(
        feed.download(
          {
            name: 'kombuse',
            version: '1.0.0',
            manifest: { name: 'kombuse', version: '1.0.0', type: 'app' },
          },
          '/tmp/dest'
        )
      ).rejects.toThrow(FeedError)
    })
  })

  describe('auth', () => {
    it('should include auth header in API requests', async () => {
      const authedFeed = new UpdateApiFeed({
        baseUrl: 'https://kombuse.dev',
        packageName: 'kombuse',
        auth: { token: 'my-token' },
      })

      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(null))

      await authedFeed.getVersions('kombuse')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://kombuse.dev/api/updates/latest',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      )
    })

    it('should include auth in checksum requests', async () => {
      const authedFeed = new UpdateApiFeed({
        baseUrl: 'https://kombuse.dev',
        packageName: 'kombuse',
        auth: { token: 'my-token' },
      })

      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM))

      await authedFeed.getVersions('kombuse')

      // Second fetch call is the checksum request
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1]![1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('should throw FeedError on non-200 API response', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 500))

      await expect(feed.getVersions('kombuse')).rejects.toThrow(FeedError)
    })

    it('should throw FeedError on 404', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse(null, 404))

      await expect(feed.getVersions('kombuse')).rejects.toThrow(FeedError)
    })

    it('should handle checksum fetch failure gracefully', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockRejectedValueOnce(new Error('Network error'))

      const versions = await feed.getVersions('kombuse')

      expect(versions).toHaveLength(1)
      expect(versions[0]!.checksum).toBeUndefined()
    })
  })

  describe('checksum parsing', () => {
    it('should parse hash from checksum file with filename', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(`${VALID_CHECKSUM}  package-1.2.0.tar.gz\n`))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.checksum).toBe(VALID_CHECKSUM)
    })

    it('should parse standalone hash', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(`${VALID_CHECKSUM}\n`))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.checksum).toBe(VALID_CHECKSUM)
    })

    it('should lowercase the hash', async () => {
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(makeApiResponse()))
        .mockResolvedValueOnce(mockTextResponse(VALID_CHECKSUM.toUpperCase()))

      const versions = await feed.getVersions('kombuse')

      expect(versions[0]!.checksum).toBe(VALID_CHECKSUM)
    })
  })
})
