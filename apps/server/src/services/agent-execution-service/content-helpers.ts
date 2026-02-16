import type { ImageAttachment } from '@kombuse/types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function buildPersistedContent(message: string, images?: ImageAttachment[]): string {
  if (!images || images.length === 0) return message
  const placeholders = images.map(
    (img) => `[image: ${img.mediaType}, ${formatBytes(img.data.length * 0.75)}]`
  )
  return [message, ...placeholders].filter(Boolean).join('\n')
}
