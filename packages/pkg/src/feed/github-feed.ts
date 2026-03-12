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

export interface GitHubFeedOptions {
  repo: string
  packageName: string
  packageType?: PkgManifest['type']
  auth?: FeedAuth
  assetPattern?: RegExp
  apiBase?: string
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
  url: string
}

export class GitHubFeed implements FeedProvider {
  readonly id: string
  readonly name: string
  private readonly repo: string
  private readonly packageName: string
  private readonly packageType: PkgManifest['type']
  private readonly auth?: FeedAuth
  private readonly assetPattern: RegExp
  private readonly apiBase: string

  constructor(options: GitHubFeedOptions) {
    this.repo = options.repo
    this.packageName = options.packageName
    this.packageType = options.packageType ?? 'app'
    this.auth = options.auth
    this.assetPattern = options.assetPattern ?? /\.tar\.gz$/
    this.apiBase = options.apiBase ?? 'https://api.github.com'
    this.id = `github:${options.repo}`
    this.name = `GitHub (${options.repo})`
  }

  async listPackages(): Promise<PackageVersionInfo[]> {
    const versions = await this.getVersions(this.packageName)
    return versions.length > 0 ? [versions[0]!] : []
  }

  async getVersions(packageName: string): Promise<PackageVersionInfo[]> {
    if (packageName !== this.packageName) return []

    const releases = await this.fetchReleases()
    const versions: PackageVersionInfo[] = []

    for (const release of releases) {
      if (release.draft || release.prerelease) continue

      const version = this.extractVersion(release.tag_name)
      if (!version || !valid(version)) continue

      const asset = release.assets.find((a) => this.assetPattern.test(a.name))

      versions.push({
        name: this.packageName,
        version,
        manifest: {
          name: this.packageName,
          version,
          type: this.packageType,
          description: release.name ?? undefined,
        },
        downloadUrl: asset?.browser_download_url,
        publishedAt: release.published_at,
        archiveSize: asset?.size,
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
    onProgress?: (progress: DownloadProgress) => void,
    expectedSize?: number
  ): Promise<string> {
    if (!info.downloadUrl) {
      throw new FeedError(this.id, 'No download URL available for this release')
    }
    await downloadFile(info.downloadUrl, destPath, this.auth, onProgress, expectedSize)
    return destPath
  }

  private async fetchReleases(): Promise<GitHubRelease[]> {
    const url = `${this.apiBase}/repos/${this.repo}/releases?per_page=100`
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
    }
    if (this.auth) {
      headers['Authorization'] = `${this.auth.type ?? 'Bearer'} ${this.auth.token}`
    }

    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new FeedError(
        this.id,
        `GitHub API error: ${response.status} ${response.statusText}`
      )
    }

    return (await response.json()) as GitHubRelease[]
  }

  private extractVersion(tagName: string): string {
    return tagName.startsWith('v') ? tagName.slice(1) : tagName
  }
}
