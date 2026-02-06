import { existsSync, mkdirSync, unlinkSync, createReadStream } from 'fs'
import { writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import type { ReadStream } from 'fs'

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export interface IFileStorage {
  save(
    filename: string,
    data: Buffer
  ): Promise<{ storagePath: string; sizeBytes: number }>
  delete(storagePath: string): void
  getAbsolutePath(storagePath: string): string
  createReadStream(storagePath: string): ReadStream
}

export class FileStorage implements IFileStorage {
  private uploadsRoot: string

  constructor(uploadsRoot?: string) {
    this.uploadsRoot =
      uploadsRoot ??
      join(
        process.env.HOME || process.env.USERPROFILE || '.',
        '.kombuse',
        'uploads'
      )
  }

  async save(
    filename: string,
    data: Buffer
  ): Promise<{ storagePath: string; sizeBytes: number }> {
    const now = new Date()
    const subdir = join(
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0')
    )
    const dir = join(this.uploadsRoot, subdir)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const ext = extname(filename)
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueName = `${randomUUID()}${ext ? '' : ''}${sanitized !== filename ? `-${sanitized}` : `-${filename}`}`
    const fullPath = join(dir, uniqueName)
    const storagePath = join(subdir, uniqueName)

    await writeFile(fullPath, data)

    return { storagePath, sizeBytes: data.length }
  }

  delete(storagePath: string): void {
    const fullPath = join(this.uploadsRoot, storagePath)
    if (existsSync(fullPath)) {
      unlinkSync(fullPath)
    }
  }

  getAbsolutePath(storagePath: string): string {
    return join(this.uploadsRoot, storagePath)
  }

  createReadStream(storagePath: string): ReadStream {
    return createReadStream(join(this.uploadsRoot, storagePath))
  }
}

// Singleton instance
export const fileStorage = new FileStorage()
