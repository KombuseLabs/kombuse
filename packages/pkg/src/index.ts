// Types
export type {
  PackageVersionInfo,
  DownloadProgress,
  FeedAuth,
  FeedProvider,
  CacheEntry,
  PackageCacheInterface,
  PackageManagerOptions,
  UpdateCheckResult,
  InstallResult,
  PackOptions,
  PackResult,
} from './types'

// Re-export shared types for convenience
export type { PackageType, PkgManifest } from '@kombuse/types'

// Errors
export {
  PkgError,
  IntegrityError,
  FeedError,
  VersionNotFoundError,
  CacheError,
  PackError,
} from './errors'

// Implementation
export { computeSha256, verifySha256 } from './cache/integrity'
export { PackageCache } from './cache/package-cache'
export { VersionResolver } from './version/resolver'
export { PackageManager } from './manager'
export { isNewerVersion } from './version/semver'
export { HttpFeed, type HttpFeedOptions } from './feed/http-feed'
export { pack } from './packer'
