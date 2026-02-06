import type {
  Attachment,
  AttachmentFilters,
} from '@kombuse/types'
import { attachmentsRepository } from '@kombuse/persistence'
import {
  fileStorage,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type IFileStorage,
} from './file-storage'

export interface UploadParams {
  filename: string
  mimeType: string
  data: Buffer
  ticketId?: number
  commentId?: number
  uploadedById: string
}

/**
 * Service interface for attachment operations
 */
export interface IAttachmentService {
  list(filters?: AttachmentFilters): Attachment[]
  get(id: number): Attachment | null
  getByTicket(ticketId: number): Attachment[]
  getByComment(commentId: number): Attachment[]
  upload(params: UploadParams): Promise<Attachment>
  delete(id: number): void
  getFilePath(id: number): string | null
}

/**
 * Attachment service implementation with file storage and validation
 */
export class AttachmentService implements IAttachmentService {
  private storage: IFileStorage

  constructor(storage?: IFileStorage) {
    this.storage = storage ?? fileStorage
  }

  list(filters?: AttachmentFilters): Attachment[] {
    return attachmentsRepository.list(filters)
  }

  get(id: number): Attachment | null {
    return attachmentsRepository.get(id)
  }

  getByTicket(ticketId: number): Attachment[] {
    return attachmentsRepository.getByTicket(ticketId)
  }

  getByComment(commentId: number): Attachment[] {
    return attachmentsRepository.getByComment(commentId)
  }

  async upload(params: UploadParams): Promise<Attachment> {
    const { filename, mimeType, data, ticketId, commentId, uploadedById } =
      params

    if (!ticketId && !commentId) {
      throw new Error('Either ticketId or commentId must be provided')
    }
    if (ticketId && commentId) {
      throw new Error('Cannot attach to both a ticket and a comment')
    }

    if (
      !ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])
    ) {
      throw new Error(
        `MIME type '${mimeType}' is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      )
    }

    if (data.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size ${data.length} bytes exceeds maximum of ${MAX_FILE_SIZE_BYTES} bytes (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`
      )
    }

    const { storagePath, sizeBytes } = await this.storage.save(filename, data)

    try {
      return attachmentsRepository.create({
        ticket_id: ticketId,
        comment_id: commentId,
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        storage_path: storagePath,
        uploaded_by_id: uploadedById,
      })
    } catch (error) {
      // Clean up the orphaned file if DB insert fails
      this.storage.delete(storagePath)
      throw error
    }
  }

  delete(id: number): void {
    const attachment = attachmentsRepository.get(id)
    if (!attachment) {
      throw new Error(`Attachment ${id} not found`)
    }

    this.storage.delete(attachment.storage_path)
    const success = attachmentsRepository.delete(id)
    if (!success) {
      throw new Error(`Failed to delete attachment ${id}`)
    }
  }

  getFilePath(id: number): string | null {
    const attachment = attachmentsRepository.get(id)
    if (!attachment) {
      return null
    }
    return this.storage.getAbsolutePath(attachment.storage_path)
  }
}

// Singleton instance
export const attachmentService = new AttachmentService()
