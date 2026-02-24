import type {
  FeedProvider,
  PackageVersionInfo,
  DownloadProgress,
  FeedAuth,
} from '../types'
import { FeedError } from '../errors'
import { downloadFile } from './feed-provider'

export interface UpdateApiFeedOptions {
  baseUrl?: string
  packageName?: string
  auth?: FeedAuth
}

interface UpdateApiResponse {
  version: string
  downloadUrl: string
  checksumUrl: string
  releaseUrl: string
  releaseNotes: string | null
  publishedAt: string
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

export class UpdateApiFeed implements FeedProvider {
  readonly id: string
  readonly name: string
  private readonly baseUrl: string
  private readonly packageName: string
  private readonly auth?: FeedAuth

  constructor(options?: UpdateApiFeedOptions) {
    this.baseUrl = (options?.baseUrl ?? 'https://kombuse.dev').replace(/\/+$/, '')
    this.packageName = options?.packageName ?? 'kombuse'
    this.auth = options?.auth
    this.id = `update-api:${this.baseUrl}`
    this.name = `Update API (${this.baseUrl})`
  }

  async listPackages(): Promise<PackageVersionInfo[]> {
    const info = await this.fetchLatest()
    return info ? [info] : []
  }

  async getVersions(packageName: string): Promise<PackageVersionInfo[]> {
    if (packageName !== this.packageName) return []
    const info = await this.fetchLatest()
    return info ? [info] : []
  }

  async getVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersionInfo | null> {
    if (packageName !== this.packageName) return null
    const info = await this.fetchLatest()
    if (!info || info.version !== version) return null
    return info
  }

  async download(
    info: PackageVersionInfo,
    destPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    if (!info.downloadUrl) {
      throw new FeedError(this.id, 'No download URL available')
    }
    await downloadFile(info.downloadUrl, destPath, this.auth, onProgress)
    return destPath
  }

  private async fetchLatest(): Promise<PackageVersionInfo | null> {
    const url = `${this.baseUrl}/api/updates/latest`
    const headers: Record<string, string> = {}
    if (this.auth) {
      headers['Authorization'] = `${this.auth.type ?? 'Bearer'} ${this.auth.token}`
    }

    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new FeedError(
        this.id,
        `HTTP ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()
    if (!data || !data.version) {
      return null
    }

    const release = data as UpdateApiResponse

    const checksum = await this.resolveChecksum(
      resolveUrl(release.checksumUrl, this.baseUrl)
    )

    return {
      name: this.packageName,
      version: release.version,
      manifest: {
        name: this.packageName,
        version: release.version,
        type: 'app',
        metadata: {
          releaseUrl: release.releaseUrl,
          releaseNotes: release.releaseNotes,
          checksumUrl: resolveUrl(release.checksumUrl, this.baseUrl),
        },
      },
      downloadUrl: resolveUrl(release.downloadUrl, this.baseUrl),
      checksum,
      publishedAt: release.publishedAt,
      archiveFormat: 'tar.gz',
    }
  }

  private async resolveChecksum(checksumUrl: string): Promise<string | undefined> {
    try {
      const headers: Record<string, string> = {}
      if (this.auth) {
        headers['Authorization'] = `${this.auth.type ?? 'Bearer'} ${this.auth.token}`
      }

      const response = await fetch(checksumUrl, { headers })
      if (!response.ok) return undefined

      const content = await response.text()
      const hash = content.split(/\s+/)[0]?.toLowerCase()

      if (!hash || hash.length !== 64) return undefined
      return hash
    } catch {
      return undefined
    }
  }
}
