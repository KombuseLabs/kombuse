import { valid, rcompare } from 'semver'
import type { PkgManifest } from '@kombuse/types'
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

export interface HttpPackageIndex {
  packages: Record<
    string,
    {
      versions: Record<
        string,
        {
          url: string
          checksum?: string
          manifest: PkgManifest
          publishedAt?: string
        }
      >
    }
  >
}

export class HttpFeed implements FeedProvider {
  readonly id: string
  readonly name: string
  private readonly baseUrl: string
  private readonly auth?: FeedAuth
  private readonly cacheTtlMs?: number
  private cachedIndex: HttpPackageIndex | null = null
  private cachedAt: number = 0

  constructor(options: HttpFeedOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.auth = options.auth
    this.cacheTtlMs = options.cacheTtlMs
    this.id = `http:${this.baseUrl}`
    this.name = `HTTP (${this.baseUrl})`
  }

  async listPackages(): Promise<PackageVersionInfo[]> {
    const index = await this.fetchIndex()
    const results: PackageVersionInfo[] = []

    for (const [name, pkg] of Object.entries(index.packages)) {
      const versions = Object.entries(pkg.versions)
        .filter(([v]) => valid(v) !== null)
        .sort(([a], [b]) => rcompare(a, b))

      const latest = versions[0]
      if (!latest) continue

      const [version, info] = latest
      results.push({
        name,
        version,
        manifest: info.manifest,
        downloadUrl: info.url,
        checksum: info.checksum,
        publishedAt: info.publishedAt,
      })
    }

    return results
  }

  async getVersions(packageName: string): Promise<PackageVersionInfo[]> {
    const index = await this.fetchIndex()
    const pkg = index.packages[packageName]
    if (!pkg) return []

    const versions: PackageVersionInfo[] = []
    for (const [version, info] of Object.entries(pkg.versions)) {
      if (!valid(version)) continue
      versions.push({
        name: packageName,
        version,
        manifest: info.manifest,
        downloadUrl: info.url,
        checksum: info.checksum,
        publishedAt: info.publishedAt,
      })
    }

    versions.sort((a, b) => rcompare(a.version, b.version))
    return versions
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
    this.cachedIndex = null
    this.cachedAt = 0
  }

  private async fetchIndex(): Promise<HttpPackageIndex> {
    if (this.cachedIndex) {
      if (!this.cacheTtlMs || Date.now() - this.cachedAt < this.cacheTtlMs) {
        return this.cachedIndex
      }
      this.cachedIndex = null
    }

    const url = `${this.baseUrl}/index.json`
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

    this.cachedIndex = (await response.json()) as HttpPackageIndex
    this.cachedAt = Date.now()
    return this.cachedIndex
  }
}
