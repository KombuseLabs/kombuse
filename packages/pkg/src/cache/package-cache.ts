import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { mkdir, copyFile, cp, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { rcompare, valid } from 'semver'
import type { PkgManifest } from '@kombuse/types'
import type { PackageCacheInterface, CacheEntry } from '../types'
import { computeSha256 } from './integrity'

const DEFAULT_CACHE_DIR = join(homedir(), '.kombuse', 'cache', 'packages')

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function computeDirectorySize(dirPath: string): Promise<number> {
  let total = 0
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += await computeDirectorySize(fullPath)
    } else {
      const s = await stat(fullPath)
      total += s.size
    }
  }
  return total
}

function hashManifest(manifest: PkgManifest): string {
  return createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex')
}

export class PackageCache implements PackageCacheInterface {
  readonly baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_CACHE_DIR
  }

  private versionDir(name: string, version: string): string {
    return join(this.baseDir, name, version)
  }

  private contentPath(name: string, version: string): string {
    return join(this.versionDir(name, version), 'content')
  }

  private entryPath(name: string, version: string): string {
    return join(this.versionDir(name, version), 'cache-entry.json')
  }

  async has(name: string, version: string): Promise<boolean> {
    const entryFile = this.entryPath(name, version)
    const content = this.contentPath(name, version)
    return (await pathExists(entryFile)) && (await pathExists(content))
  }

  async get(name: string, version: string): Promise<CacheEntry | null> {
    const entryFile = this.entryPath(name, version)
    if (!(await pathExists(entryFile))) return null

    try {
      const raw = await readFile(entryFile, 'utf-8')
      const entry = JSON.parse(raw) as CacheEntry

      const content = this.contentPath(name, version)
      if (!(await pathExists(content))) return null

      // Verify integrity
      const s = await stat(content)
      if (s.isFile()) {
        const actualHash = await computeSha256(content)
        if (actualHash !== entry.checksum) return null
      } else if (s.isDirectory()) {
        const manifestHash = hashManifest(entry.manifest)
        if (manifestHash !== entry.checksum) return null
      }

      return entry
    } catch {
      return null
    }
  }

  async put(
    name: string,
    version: string,
    sourcePath: string,
    manifest: PkgManifest
  ): Promise<CacheEntry> {
    const dir = this.versionDir(name, version)
    await mkdir(dir, { recursive: true })

    const dest = this.contentPath(name, version)
    const sourceStat = await stat(sourcePath)

    let checksum: string
    let size: number

    if (sourceStat.isDirectory()) {
      await cp(sourcePath, dest, { recursive: true })
      checksum = hashManifest(manifest)
      size = await computeDirectorySize(dest)
    } else {
      await copyFile(sourcePath, dest)
      checksum = await computeSha256(dest)
      size = (await stat(dest)).size
    }

    const entry: CacheEntry = {
      name,
      version,
      checksum,
      cachedAt: new Date().toISOString(),
      size,
      manifest,
    }

    await writeFile(this.entryPath(name, version), JSON.stringify(entry, null, 2))
    return entry
  }

  async remove(name: string, version: string): Promise<boolean> {
    const dir = this.versionDir(name, version)
    if (!(await pathExists(dir))) return false
    await rm(dir, { recursive: true, force: true })
    return true
  }

  async list(name: string): Promise<CacheEntry[]> {
    const packageDir = join(this.baseDir, name)
    if (!(await pathExists(packageDir))) return []

    const entries: CacheEntry[] = []
    const dirs = await readdir(packageDir, { withFileTypes: true })

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      if (!valid(dir.name)) continue

      const entryFile = join(packageDir, dir.name, 'cache-entry.json')
      if (!(await pathExists(entryFile))) continue

      try {
        const raw = await readFile(entryFile, 'utf-8')
        entries.push(JSON.parse(raw) as CacheEntry)
      } catch {
        // Skip invalid entries
      }
    }

    entries.sort((a, b) => rcompare(a.version, b.version))
    return entries
  }

  async prune(name: string, keepCount: number): Promise<number> {
    const entries = await this.list(name)
    if (entries.length <= keepCount) return 0

    const toRemove = entries.slice(keepCount)
    let removed = 0

    for (const entry of toRemove) {
      const success = await this.remove(entry.name, entry.version)
      if (success) removed++
    }

    return removed
  }
}
