import type { FeedProvider, PackageVersionInfo } from '../types'
import { isNewerVersion } from './semver'

export class VersionResolver {
  async resolveLatest(
    packageName: string,
    feeds: FeedProvider[]
  ): Promise<{ info: PackageVersionInfo; feedId: string } | null> {
    if (feeds.length === 0) return null

    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const versions = await feed.getVersions(packageName)
        return { feed, versions }
      })
    )

    let best: { info: PackageVersionInfo; feedId: string } | null = null

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const { feed, versions } = result.value
      if (versions.length === 0) continue

      const latest = versions[0]!
      if (!best || isNewerVersion(latest.version, best.info.version)) {
        best = { info: latest, feedId: feed.id }
      }
    }

    return best
  }

  async checkForUpdates(
    packageName: string,
    currentVersion: string,
    feeds: FeedProvider[]
  ): Promise<{ info: PackageVersionInfo; feedId: string } | null> {
    const latest = await this.resolveLatest(packageName, feeds)
    if (!latest) return null
    if (!isNewerVersion(latest.info.version, currentVersion)) return null
    return latest
  }
}
