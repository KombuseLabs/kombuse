import { valid, rcompare } from 'semver'
import type {
  FeedProvider,
  PackageVersionInfo,
  DownloadProgress,
  FeedAuth,
} from '../types'
import { FeedError } from '../errors'
import { downloadFile } from './feed-provider'

export interface HttpFeedOptions {
  baseUrl: string
  auth?: FeedAuth
  cacheTtlMs?: number
}

/** Response from GET /api/pkg */
interface PackageListResponse {
  packages: Array<{
    id: string
    author: string
    name: string
    type?: string
    source?: string
    source_config?: unknown
    created_at: string
    updated_at: string
    latest_version: string | null
  }>
}

/** Response from GET /api/pkg/{author}/{name}/versions */
interface PackageVersionsResponse {
  versions: Array<{
    version: string
    channel: string
    type: string
    archive_size: number
    checksum?: string
    release_notes?: string
    manifest: { author: string; name: string; version: string; type: string; channel?: string }
    published_at: string
    download_url: string
  }>
}

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

export class HttpFeed implements FeedProvider {
  readonly id: string
  readonly name: string
  private readonly baseUrl: string
  private readonly auth?: FeedAuth
  private readonly cacheTtlMs?: number
  private cachedPluginList: CacheEntry<PackageVersionInfo[]> | null = null
  private cachedVersions = new Map<string, CacheEntry<PackageVersionInfo[]>>()

  constructor(options: HttpFeedOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.auth = options.auth
    this.cacheTtlMs = options.cacheTtlMs
    this.id = `http:${this.baseUrl}`
    this.name = `HTTP (${this.baseUrl})`
  }

  async listPackages(): Promise<PackageVersionInfo[]> {
    if (this.cachedPluginList && this.isCacheValid(this.cachedPluginList.cachedAt)) {
      return this.cachedPluginList.data
    }

    const response = await this.fetch(`${this.baseUrl}/api/pkg`)
    const body = (await response.json()) as PackageListResponse

    const results: PackageVersionInfo[] = []
    for (const pkg of body.packages) {
      if (!pkg.latest_version || !valid(pkg.latest_version)) continue

      const compoundName = `${pkg.author}/${pkg.name}`
      results.push({
        name: compoundName,
        version: pkg.latest_version,
        manifest: {
          name: pkg.name,
          version: pkg.latest_version,
          type: (pkg.type as PackageVersionInfo['manifest']['type']) ?? 'plugin',
          author: pkg.author,
        },
        archiveFormat: 'tar.gz',
      })
    }

    this.cachedPluginList = { data: results, cachedAt: Date.now() }
    return results
  }

  async getVersions(packageName: string): Promise<PackageVersionInfo[]> {
    const cached = this.cachedVersions.get(packageName)
    if (cached && this.isCacheValid(cached.cachedAt)) {
      return cached.data
    }

    const { author, name } = this.splitPackageName(packageName)
    const response = await this.fetch(
      `${this.baseUrl}/api/pkg/${encodeURIComponent(author)}/${encodeURIComponent(name)}/versions`
    )
    const body = (await response.json()) as PackageVersionsResponse

    const results: PackageVersionInfo[] = []
    for (const entry of body.versions) {
      if (!valid(entry.version)) continue

      const downloadUrl = entry.download_url.startsWith('http')
        ? entry.download_url
        : `${this.baseUrl}${entry.download_url}`

      results.push({
        name: packageName,
        version: entry.version,
        manifest: {
          name,
          version: entry.version,
          type: (entry.manifest?.type ?? entry.type ?? 'plugin') as PackageVersionInfo['manifest']['type'],
          author,
          channel: entry.channel,
          release_notes: entry.release_notes,
        },
        checksum: entry.checksum,
        downloadUrl,
        publishedAt: entry.published_at,
        archiveFormat: 'tar.gz',
      })
    }

    results.sort((a, b) => rcompare(a.version, b.version))
    this.cachedVersions.set(packageName, { data: results, cachedAt: Date.now() })
    return results
  }

  async getVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersionInfo | null> {
    const versions = await this.getVersions(packageName)
    return versions.find((v) => v.version === version) ?? null
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

  clearCache(): void {
    this.cachedPluginList = null
    this.cachedVersions.clear()
  }

  private isCacheValid(cachedAt: number): boolean {
    if (!this.cacheTtlMs) return true
    return Date.now() - cachedAt < this.cacheTtlMs
  }

  private splitPackageName(packageName: string): { author: string; name: string } {
    const slashIndex = packageName.indexOf('/')
    if (slashIndex === -1) {
      throw new FeedError(
        this.id,
        `Invalid package name "${packageName}": expected "{author}/{name}" format`
      )
    }
    return {
      author: packageName.slice(0, slashIndex),
      name: packageName.slice(slashIndex + 1),
    }
  }

  private async fetch(url: string): Promise<Response> {
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

    return response
  }
}
