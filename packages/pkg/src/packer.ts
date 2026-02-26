import { stat } from 'node:fs/promises'
import { create as createTar } from 'tar'
import type { PackOptions, PackResult } from './types'
import { computeSha256 } from './cache/integrity'
import { PackError } from './errors'

/**
 * Create a tar.gz archive from a directory.
 *
 * By default produces a flat archive (prefix: '.').
 * Pass `prefix: 'package'` to nest contents under a `package/` directory,
 * matching the layout expected by PackageManager.install().
 */
export async function pack(options: PackOptions): Promise<PackResult> {
  const { sourceDir, outputPath, prefix = '.' } = options

  try {
    if (prefix === '.') {
      await createTar(
        { gzip: true, file: outputPath, cwd: sourceDir },
        ['.']
      )
    } else {
      await createTar(
        { gzip: true, file: outputPath, cwd: sourceDir, prefix },
        ['.']
      )
    }
  } catch (err) {
    throw new PackError(
      `Failed to create archive: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const checksum = await computeSha256(outputPath)
  const fileStat = await stat(outputPath)

  return {
    archivePath: outputPath,
    checksum,
    size: fileStat.size,
  }
}
