import type { FastifyInstance } from 'fastify'
import { commentsRepository, mentionsRepository } from '@kombuse/persistence'
import {
  createCommentSchema,
  updateCommentSchema,
  commentFiltersSchema,
} from '../schemas/comments'

export async function commentRoutes(fastify: FastifyInstance) {
  // List comments for a ticket
  fastify.get<{
    Params: { ticketId: string }
  }>('/tickets/:ticketId/comments', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    const parseResult = commentFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return commentsRepository.list({
      ticket_id: ticketId,
      ...parseResult.data,
    })
  })

  // Get single comment
  fastify.get<{
    Params: { id: string }
  }>('/comments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const comment = commentsRepository.get(id)
    if (!comment) {
      return reply.status(404).send({ error: 'Comment not found' })
    }
    return comment
  })

  // Create comment on a ticket
  fastify.post<{
    Params: { ticketId: string }
  }>('/tickets/:ticketId/comments', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    const parseResult = createCommentSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const comment = commentsRepository.create({
      ticket_id: ticketId,
      ...parseResult.data,
    })
    return reply.status(201).send(comment)
  })

  // Update comment
  fastify.patch<{
    Params: { id: string }
  }>('/comments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const parseResult = updateCommentSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const comment = commentsRepository.update(id, parseResult.data)
    if (!comment) {
      return reply.status(404).send({ error: 'Comment not found' })
    }
    return comment
  })

  // Delete comment
  fastify.delete<{
    Params: { id: string }
  }>('/comments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const deleted = commentsRepository.delete(id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Comment not found' })
    }
    return reply.status(204).send()
  })

  // Get mentions in a comment
  fastify.get<{
    Params: { id: string }
  }>('/comments/:id/mentions', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    return mentionsRepository.getByComment(id)
  })
}
