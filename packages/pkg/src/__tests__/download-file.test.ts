import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadFile } from '../feed/feed-provider'
import { FeedError } from '../errors'

function createMockResponse(
  data: string | Buffer,
  contentLength?: number
): Response {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split into multiple chunks to test progress tracking
      const chunkSize = Math.max(1, Math.ceil(bytes.length / 3))
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize))
      }
      controller.close()
    },
  })

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: stream,
    headers: new Headers(
      contentLength !== undefined
        ? { 'content-length': String(contentLength) }
        : {}
    ),
  } as unknown as Response
}

describe('downloadFile', () => {
  let tempDir: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-download-'))
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('should download file to destination', async () => {
    const data = 'hello world download test'
    fetchMock.mockResolvedValue(createMockResponse(data, data.length))
    const dest = join(tempDir, 'output.bin')

    await downloadFile('https://example.com/file.tar.gz', dest)

    expect(readFileSync(dest, 'utf-8')).toBe(data)
  })

  it('should call progress callback with correct values', async () => {
    const data = 'progress-test-data-longer-content-here'
    fetchMock.mockResolvedValue(createMockResponse(data, data.length))
    const dest = join(tempDir, 'output.bin')

    const progressCalls: Array<{
      phase: string
      percent: number
      bytesDownloaded: number
    }> = []
    await downloadFile(
      'https://example.com/file.tar.gz',
      dest,
      undefined,
      (p) => {
        progressCalls.push({
          phase: p.phase,
          percent: p.percent,
          bytesDownloaded: p.bytesDownloaded,
        })
      }
    )

    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls.every((c) => c.phase === 'downloading')).toBe(true)

    const last = progressCalls[progressCalls.length - 1]!
    expect(last.bytesDownloaded).toBe(data.length)
    expect(last.percent).toBe(100)
  })

  it('should report percent as -1 when content-length is unknown', async () => {
    const data = 'no-length-data'
    fetchMock.mockResolvedValue(createMockResponse(data))
    const dest = join(tempDir, 'output.bin')

    const percents: number[] = []
    await downloadFile(
      'https://example.com/file.tar.gz',
      dest,
      undefined,
      (p) => {
        percents.push(p.percent)
      }
    )

    expect(percents.every((p) => p === -1)).toBe(true)
  })

  it('should include auth header when provided', async () => {
    fetchMock.mockResolvedValue(createMockResponse('data', 4))
    const dest = join(tempDir, 'output.bin')

    await downloadFile('https://example.com/file', dest, {
      token: 'my-token',
      type: 'Token',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/file',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Token my-token',
        }),
      })
    )
  })

  it('should use Bearer as default auth type', async () => {
    fetchMock.mockResolvedValue(createMockResponse('data', 4))
    const dest = join(tempDir, 'output.bin')

    await downloadFile('https://example.com/file', dest, { token: 'tok' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/file',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
        }),
      })
    )
  })

  it('should throw FeedError on HTTP error response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: null,
      headers: new Headers(),
    })
    const dest = join(tempDir, 'output.bin')

    await expect(
      downloadFile('https://example.com/missing', dest)
    ).rejects.toThrow(FeedError)
  })

  it('should use expectedSize when content-length is missing', async () => {
    const data = 'fallback-size-test-data'
    fetchMock.mockResolvedValue(createMockResponse(data))
    const dest = join(tempDir, 'output.bin')

    const progressCalls: Array<{
      percent: number
      bytesDownloaded: number
      bytesTotal: number
    }> = []
    await downloadFile(
      'https://example.com/file.tar.gz',
      dest,
      undefined,
      (p) => {
        progressCalls.push({
          percent: p.percent,
          bytesDownloaded: p.bytesDownloaded,
          bytesTotal: p.bytesTotal,
        })
      },
      data.length
    )

    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls.every((c) => c.bytesTotal === data.length)).toBe(true)

    const last = progressCalls[progressCalls.length - 1]!
    expect(last.percent).toBe(100)
    expect(last.bytesDownloaded).toBe(data.length)
  })

  it('should prefer content-length over expectedSize', async () => {
    const data = 'prefer-content-length'
    fetchMock.mockResolvedValue(createMockResponse(data, data.length))
    const dest = join(tempDir, 'output.bin')

    const progressCalls: Array<{ bytesTotal: number }> = []
    await downloadFile(
      'https://example.com/file.tar.gz',
      dest,
      undefined,
      (p) => {
        progressCalls.push({ bytesTotal: p.bytesTotal })
      },
      99999
    )

    expect(progressCalls.every((c) => c.bytesTotal === data.length)).toBe(true)
  })

  it('should throw FeedError when response has no body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: null,
      headers: new Headers(),
    })
    const dest = join(tempDir, 'output.bin')

    await expect(
      downloadFile('https://example.com/empty', dest)
    ).rejects.toThrow(FeedError)
  })
})
