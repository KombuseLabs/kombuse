import type { PkgManifest } from '@kombuse/types'

export interface PackageVersionInfo {
  name: string
  version: string
  manifest: PkgManifest
  downloadUrl?: string
  localPath?: string
  checksum?: string
  publishedAt?: string
}

export interface DownloadProgress {
  phase: 'downloading' | 'verifying' | 'extracting' | 'caching'
  percent: number
  bytesDownloaded: number
  bytesTotal: number
}

export interface FeedAuth {
  token: string
  type?: string
}

export interface FeedProvider {
  readonly id: string
  readonly name: string
  listPackages(): Promise<PackageVersionInfo[]>
  getVersions(packageName: string): Promise<PackageVersionInfo[]>
  getVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersionInfo | null>
  download(
    info: PackageVersionInfo,
    destPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string>
}

export interface CacheEntry {
  name: string
  version: string
  checksum: string
  cachedAt: string
  size: number
  manifest: PkgManifest
}

export interface PackageCacheInterface {
  has(name: string, version: string): Promise<boolean>
  get(name: string, version: string): Promise<CacheEntry | null>
  put(
    name: string,
    version: string,
    archivePath: string,
    manifest: PkgManifest
  ): Promise<CacheEntry>
  remove(name: string, version: string): Promise<boolean>
  list(name: string): Promise<CacheEntry[]>
  prune(name: string, keepCount: number): Promise<number>
}

export interface PackageManagerOptions {
  maxCachedVersions?: number
  cacheDir?: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  latest: PackageVersionInfo | null
  currentVersion: string | null
  feedId?: string
}

export interface InstallResult {
  version: string
  cachePath: string
  manifest: PkgManifest
}
