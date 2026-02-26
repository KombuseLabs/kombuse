export class PkgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PkgError'
  }
}

export class IntegrityError extends PkgError {
  constructor(expected: string, actual: string) {
    super(
      `Integrity check failed: expected ${expected.slice(0, 12)}..., got ${actual.slice(0, 12)}...`
    )
    this.name = 'IntegrityError'
  }
}

export class FeedError extends PkgError {
  constructor(feedId: string, message: string) {
    super(`Feed "${feedId}": ${message}`)
    this.name = 'FeedError'
  }
}

export class VersionNotFoundError extends PkgError {
  constructor(name: string, version: string) {
    super(`Version ${version} of "${name}" not found`)
    this.name = 'VersionNotFoundError'
  }
}

export class CacheError extends PkgError {
  constructor(message: string) {
    super(message)
    this.name = 'CacheError'
  }
}

export class PackError extends PkgError {
  constructor(message: string) {
    super(message)
    this.name = 'PackError'
  }
}
