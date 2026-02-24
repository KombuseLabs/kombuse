import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
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
  let downloaded = 0

  const fileStream = createWriteStream(destPath)
  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const canContinue = fileStream.write(value)
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

      if (!canContinue) {
        await once(fileStream, 'drain')
      }
    }
  } finally {
    fileStream.end()
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })
}
