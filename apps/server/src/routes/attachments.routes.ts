import type { FastifyInstance } from 'fastify'
import { attachmentService } from '@kombuse/services'
import { resolveTicketId } from '@kombuse/persistence'
import { attachmentFiltersSchema } from '../schemas/attachments.schema'
import { existsSync } from 'fs'
import { createReadStream } from 'fs'

export async function attachmentRoutes(fastify: FastifyInstance) {
  // Upload attachment to a ticket by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/attachments', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const uploadedByIdField = file.fields.uploaded_by_id
    const uploadedById =
      uploadedByIdField &&
      'value' in uploadedByIdField &&
      typeof uploadedByIdField.value === 'string'
        ? uploadedByIdField.value
        : null
    if (!uploadedById) {
      return reply
        .status(400)
        .send({ error: 'uploaded_by_id field is required' })
    }

    const data = await file.toBuffer()

    try {
      const attachment = await attachmentService.upload({
        filename: file.filename,
        mimeType: file.mimetype,
        data,
        projectId: request.params.projectId,
        ticketNumber,
        uploadedById,
      })
      return reply.status(201).send(attachment)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return reply.status(404).send({ error: 'Ticket not found' })
        }
        if (
          error.message.includes('MIME type') ||
          error.message.includes('File size')
        ) {
          return reply.status(400).send({ error: error.message })
        }
      }
      throw error
    }
  })

  // Upload attachment to a comment
  fastify.post<{
    Params: { commentId: string }
  }>('/comments/:commentId/attachments', async (request, reply) => {
    const commentId = parseInt(request.params.commentId, 10)
    if (isNaN(commentId)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const uploadedByIdField = file.fields.uploaded_by_id
    const uploadedById =
      uploadedByIdField &&
      'value' in uploadedByIdField &&
      typeof uploadedByIdField.value === 'string'
        ? uploadedByIdField.value
        : null
    if (!uploadedById) {
      return reply
        .status(400)
        .send({ error: 'uploaded_by_id field is required' })
    }

    const data = await file.toBuffer()

    try {
      const attachment = await attachmentService.upload({
        filename: file.filename,
        mimeType: file.mimetype,
        data,
        commentId,
        uploadedById,
      })
      return reply.status(201).send(attachment)
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('MIME type') ||
          error.message.includes('File size')
        ) {
          return reply.status(400).send({ error: error.message })
        }
      }
      throw error
    }
  })

  // Get attachment metadata
  fastify.get<{
    Params: { id: string }
  }>('/attachments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid attachment ID' })
    }

    const attachment = attachmentService.get(id)
    if (!attachment) {
      return reply.status(404).send({ error: 'Attachment not found' })
    }
    return attachment
  })

  // Download/stream the actual file
  fastify.get<{
    Params: { id: string }
  }>('/attachments/:id/download', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid attachment ID' })
    }

    const attachment = attachmentService.get(id)
    if (!attachment) {
      return reply.status(404).send({ error: 'Attachment not found' })
    }

    const filePath = attachmentService.getFilePath(id)
    if (!filePath || !existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found on disk' })
    }

    reply.type(attachment.mime_type)
    reply.header(
      'Content-Disposition',
      `inline; filename="${attachment.filename}"`
    )
    reply.header('Content-Length', attachment.size_bytes)
    return reply.send(createReadStream(filePath))
  })

  // List attachments for a ticket by project-scoped number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/attachments', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = attachmentFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const ticketId = resolveTicketId(request.params.projectId, ticketNumber)
      return attachmentService.list({
        ticket_id: ticketId,
        ...parseResult.data,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      throw error
    }
  })

  // List attachments for a comment
  fastify.get<{
    Params: { commentId: string }
  }>('/comments/:commentId/attachments', async (request, reply) => {
    const commentId = parseInt(request.params.commentId, 10)
    if (isNaN(commentId)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const parseResult = attachmentFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return attachmentService.list({
      comment_id: commentId,
      ...parseResult.data,
    })
  })

  // Delete attachment
  fastify.delete<{
    Params: { id: string }
  }>('/attachments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid attachment ID' })
    }

    try {
      attachmentService.delete(id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Attachment not found' })
      }
      throw error
    }
  })
}
