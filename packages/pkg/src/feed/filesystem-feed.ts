import { readdir, readFile, stat, cp, copyFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { valid, rcompare } from 'semver'
import type { PkgManifest } from '@kombuse/types'
import type { FeedProvider, PackageVersionInfo, DownloadProgress } from '../types'
import { FeedError } from '../errors'

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export interface FilesystemFeedOptions {
  directory: string
  manifestFilename?: string
}

export class FilesystemFeed implements FeedProvider {
  readonly id: string
  readonly name: string
  private readonly dir: string
  private readonly manifestFilename: string

  constructor(options: FilesystemFeedOptions) {
    this.dir = options.directory
    this.manifestFilename = options.manifestFilename ?? 'manifest.json'
    this.id = `fs:${options.directory}`
    this.name = `Filesystem (${basename(options.directory)})`
  }

  async listPackages(): Promise<PackageVersionInfo[]> {
    if (!(await pathExists(this.dir))) return []

    const results: PackageVersionInfo[] = []
    const entries = await readdir(this.dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const versions = await this.getVersions(entry.name)
      if (versions.length > 0) {
        results.push(versions[0]!)
      }
    }

    return results
  }

  async getVersions(packageName: string): Promise<PackageVersionInfo[]> {
    const packageDir = join(this.dir, packageName)
    if (!(await pathExists(packageDir))) return []

    // Check if there's a manifest directly in the package dir (single-version)
    const directManifest = join(packageDir, this.manifestFilename)
    if (await pathExists(directManifest)) {
      const manifest = await this.readManifest(directManifest)
      if (manifest) {
        return [
          {
            name: packageName,
            version: manifest.version,
            manifest,
            localPath: packageDir,
          },
        ]
      }
    }

    // Check version subdirectories
    const versions: PackageVersionInfo[] = []
    const subdirs = await readdir(packageDir, { withFileTypes: true })

    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) continue
      if (!valid(subdir.name)) continue

      const manifestPath = join(packageDir, subdir.name, this.manifestFilename)
      if (!(await pathExists(manifestPath))) continue

      const manifest = await this.readManifest(manifestPath)
      if (!manifest) continue

      versions.push({
        name: packageName,
        version: subdir.name,
        manifest,
        localPath: join(packageDir, subdir.name),
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
    if (!info.localPath) {
      throw new FeedError(this.id, 'No local path for filesystem package')
    }

    if (!(await pathExists(info.localPath))) {
      throw new FeedError(this.id, `Source path does not exist: ${info.localPath}`)
    }

    const s = await stat(info.localPath)
    if (s.isDirectory()) {
      await cp(info.localPath, destPath, { recursive: true })
    } else {
      await copyFile(info.localPath, destPath)
    }

    onProgress?.({
      phase: 'downloading',
      percent: 100,
      bytesDownloaded: 0,
      bytesTotal: 0,
    })

    return destPath
  }

  private async readManifest(path: string): Promise<PkgManifest | null> {
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as PkgManifest
      if (!parsed.name || !parsed.version || !parsed.type) return null
      return parsed
    } catch {
      return null
    }
  }
}
