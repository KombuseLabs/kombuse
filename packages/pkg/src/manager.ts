import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extract } from 'tar'
import type {
  FeedProvider,
  PackageManagerOptions,
  UpdateCheckResult,
  InstallResult,
  DownloadProgress,
  PackageVersionInfo,
} from './types'
import { PackageCache } from './cache/package-cache'
import { VersionResolver } from './version/resolver'
import { verifySha256 } from './cache/integrity'
import { VersionNotFoundError } from './errors'

const DEFAULT_MAX_CACHED = 5

export class PackageManager {
  private feeds: FeedProvider[] = []
  private readonly cache: PackageCache
  private readonly resolver: VersionResolver
  private readonly maxCachedVersions: number

  constructor(options?: PackageManagerOptions) {
    const cacheDir =
      options?.cacheDir ?? join(homedir(), '.kombuse', 'cache', 'packages')
    this.cache = new PackageCache(cacheDir)
    this.resolver = new VersionResolver()
    this.maxCachedVersions = options?.maxCachedVersions ?? DEFAULT_MAX_CACHED
  }

  addFeed(feed: FeedProvider): void {
    this.feeds.push(feed)
  }

  removeFeed(feedId: string): boolean {
    const idx = this.feeds.findIndex((f) => f.id === feedId)
    if (idx === -1) return false
    this.feeds.splice(idx, 1)
    return true
  }

  getFeeds(): ReadonlyArray<FeedProvider> {
    return this.feeds
  }

  getCache(): PackageCache {
    return this.cache
  }

  async search(query?: string): Promise<PackageVersionInfo[]> {
    const results = await Promise.allSettled(
      this.feeds.map((feed) => feed.listPackages())
    )

    const packages: PackageVersionInfo[] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      packages.push(...result.value)
    }

    if (!query) return packages

    const lower = query.toLowerCase()
    return packages.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.manifest.description?.toLowerCase().includes(lower)
    )
  }

  async checkForUpdates(
    packageName: string,
    currentVersion: string
  ): Promise<UpdateCheckResult> {
    const result = await this.resolver.checkForUpdates(
      packageName,
      currentVersion,
      this.feeds
    )
    return {
      hasUpdate: result !== null,
      latest: result?.info ?? null,
      currentVersion,
      feedId: result?.feedId,
    }
  }

  async install(
    packageName: string,
    version: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<InstallResult> {
    // Check cache first
    const cached = await this.cache.get(packageName, version)
    if (cached) {
      return {
        version: cached.version,
        cachePath: join(this.cache.baseDir, packageName, version),
        manifest: cached.manifest,
      }
    }

    // Find in feeds
    let versionInfo: PackageVersionInfo | null = null
    let sourceFeed: FeedProvider | null = null

    for (const feed of this.feeds) {
      try {
        const info = await feed.getVersion(packageName, version)
        if (info) {
          versionInfo = info
          sourceFeed = feed
          break
        }
      } catch {
        // Try next feed
      }
    }

    if (!versionInfo || !sourceFeed) {
      throw new VersionNotFoundError(packageName, version)
    }

    // Download to temp
    const tempDir = join(tmpdir(), `pkg-install-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    const tempContent = join(tempDir, 'content')

    try {
      await sourceFeed.download(versionInfo, tempContent, onProgress)

      // Verify checksum
      if (versionInfo.checksum) {
        onProgress?.({
          phase: 'verifying',
          percent: -1,
          bytesDownloaded: 0,
          bytesTotal: 0,
        })
        await verifySha256(tempContent, versionInfo.checksum)
      }

      // Extract archive if needed
      let contentToCache = tempContent
      if (versionInfo.archiveFormat === 'tar.gz') {
        onProgress?.({
          phase: 'extracting',
          percent: -1,
          bytesDownloaded: 0,
          bytesTotal: 0,
        })
        const extractDir = join(tempDir, 'extracted')
        await mkdir(extractDir, { recursive: true })
        await extract({ file: tempContent, cwd: extractDir })
        const packageDir = join(extractDir, 'package')
        contentToCache = existsSync(packageDir) ? packageDir : extractDir
      }

      // Store in cache
      onProgress?.({
        phase: 'caching',
        percent: -1,
        bytesDownloaded: 0,
        bytesTotal: 0,
      })
      const entry = await this.cache.put(
        packageName,
        version,
        contentToCache,
        versionInfo.manifest
      )

      // Prune old versions
      await this.cache.prune(packageName, this.maxCachedVersions)

      return {
        version: entry.version,
        cachePath: join(this.cache.baseDir, packageName, version),
        manifest: entry.manifest,
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  async installLatest(
    packageName: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<InstallResult> {
    const latest = await this.resolver.resolveLatest(packageName, this.feeds)
    if (!latest) throw new VersionNotFoundError(packageName, 'latest')
    return this.install(packageName, latest.info.version, onProgress)
  }
}
