import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PkgManifest } from '@kombuse/types'
import { FilesystemFeed } from '../feed/filesystem-feed'

function writeManifest(dir: string, manifest: PkgManifest): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
}

describe('FilesystemFeed', () => {
  let tempDir: string
  let feed: FilesystemFeed

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-fs-feed-'))
    feed = new FilesystemFeed({ directory: tempDir })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('listPackages', () => {
    it('should return empty for non-existent directory', async () => {
      const badFeed = new FilesystemFeed({ directory: '/nonexistent/path' })
      expect(await badFeed.listPackages()).toEqual([])
    })

    it('should return empty for empty directory', async () => {
      expect(await feed.listPackages()).toEqual([])
    })

    it('should discover packages with versioned subdirectories', async () => {
      writeManifest(join(tempDir, 'my-plugin', '1.0.0'), {
        name: 'my-plugin',
        version: '1.0.0',
        type: 'plugin',
      })
      writeManifest(join(tempDir, 'my-plugin', '2.0.0'), {
        name: 'my-plugin',
        version: '2.0.0',
        type: 'plugin',
      })

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.name).toBe('my-plugin')
      expect(packages[0]!.version).toBe('2.0.0')
    })

    it('should discover packages with direct manifests', async () => {
      writeManifest(join(tempDir, 'simple-pkg'), {
        name: 'simple-pkg',
        version: '1.0.0',
        type: 'app',
      })

      const packages = await feed.listPackages()

      expect(packages).toHaveLength(1)
      expect(packages[0]!.name).toBe('simple-pkg')
    })

    it('should skip directories without manifests', async () => {
      mkdirSync(join(tempDir, 'no-manifest'), { recursive: true })
      writeFileSync(join(tempDir, 'no-manifest', 'readme.txt'), 'no manifest here')

      expect(await feed.listPackages()).toEqual([])
    })
  })

  describe('getVersions', () => {
    it('should return empty for unknown package', async () => {
      expect(await feed.getVersions('unknown')).toEqual([])
    })

    it('should return versions sorted descending', async () => {
      const versions = ['1.0.0', '3.0.0', '2.0.0']
      for (const v of versions) {
        writeManifest(join(tempDir, 'my-pkg', v), {
          name: 'my-pkg',
          version: v,
          type: 'plugin',
        })
      }

      const result = await feed.getVersions('my-pkg')
      const listed = result.map((v) => v.version)

      expect(listed).toEqual(['3.0.0', '2.0.0', '1.0.0'])
    })

    it('should skip non-semver directory names', async () => {
      writeManifest(join(tempDir, 'my-pkg', '1.0.0'), {
        name: 'my-pkg',
        version: '1.0.0',
        type: 'plugin',
      })
      mkdirSync(join(tempDir, 'my-pkg', 'not-a-version'), { recursive: true })
      writeFileSync(
        join(tempDir, 'my-pkg', 'not-a-version', 'manifest.json'),
        '{"name":"x","version":"bad","type":"plugin"}'
      )

      const result = await feed.getVersions('my-pkg')

      expect(result).toHaveLength(1)
      expect(result[0]!.version).toBe('1.0.0')
    })
  })

  describe('getVersion', () => {
    it('should return null for non-existent version', async () => {
      writeManifest(join(tempDir, 'my-pkg', '1.0.0'), {
        name: 'my-pkg',
        version: '1.0.0',
        type: 'plugin',
      })

      expect(await feed.getVersion('my-pkg', '2.0.0')).toBeNull()
    })

    it('should return specific version info', async () => {
      writeManifest(join(tempDir, 'my-pkg', '1.0.0'), {
        name: 'my-pkg',
        version: '1.0.0',
        type: 'plugin',
      })

      const result = await feed.getVersion('my-pkg', '1.0.0')

      expect(result).not.toBeNull()
      expect(result!.version).toBe('1.0.0')
      expect(result!.localPath).toBe(join(tempDir, 'my-pkg', '1.0.0'))
    })
  })

  describe('download', () => {
    it('should copy directory contents to destination', async () => {
      const sourceDir = join(tempDir, 'my-pkg', '1.0.0')
      writeManifest(sourceDir, {
        name: 'my-pkg',
        version: '1.0.0',
        type: 'plugin',
      })

      const destDir = join(tempDir, 'dest')
      const version = await feed.getVersion('my-pkg', '1.0.0')

      await feed.download(version!, destDir)

      expect(existsSync(join(destDir, 'manifest.json'))).toBe(true)
    })

    it('should throw when localPath is missing', async () => {
      await expect(
        feed.download(
          { name: 'pkg', version: '1.0.0', manifest: { name: 'pkg', version: '1.0.0', type: 'app' } },
          '/tmp/dest'
        )
      ).rejects.toThrow('No local path')
    })
  })
})
