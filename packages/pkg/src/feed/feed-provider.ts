import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DownloadProgress, FeedAuth } from '../types'
import { FeedError } from '../errors'

export async function downloadFile(
  url: string,
  destPath: string,
  auth?: FeedAuth,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const headers: Record<string, string> = {}
  if (auth) {
    headers['Authorization'] = `${auth.type ?? 'Bearer'} ${auth.token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok || !response.body) {
    throw new FeedError(
      'download',
      `HTTP ${response.status}: ${response.statusText}`
    )
  }

  const contentLength = parseInt(
    response.headers.get('content-length') ?? '0',
    10
  )

  const reader = response.body.getReader()
  await pipeline(
    Readable.from(readChunks(reader, contentLength, onProgress)),
    createWriteStream(destPath)
  )
}

async function* readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  contentLength: number,
  onProgress?: (progress: DownloadProgress) => void
): AsyncGenerator<Uint8Array> {
  let downloaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    downloaded += value.length
    onProgress?.({
      phase: 'downloading',
      percent:
        contentLength > 0
          ? Math.round((downloaded / contentLength) * 100)
          : -1,
      bytesDownloaded: downloaded,
      bytesTotal: contentLength,
    })

    yield value
  }
}
