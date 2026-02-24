import type { FastifyInstance } from 'fastify'
import { commentService } from '@kombuse/services'
import { resolveTicketId } from '@kombuse/persistence'
import {
  createCommentSchema,
  updateCommentSchema,
  commentFiltersSchema,
} from '../schemas/comments.schema'

export async function commentRoutes(fastify: FastifyInstance) {
  // List comments for a ticket by project-scoped number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/comments', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = commentFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const ticketId = resolveTicketId(request.params.projectId, ticketNumber)
      return commentService.list({
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

  // Get single comment
  fastify.get<{
    Params: { id: string }
  }>('/comments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    const comment = commentService.get(id)
    if (!comment) {
      return reply.status(404).send({ error: 'Comment not found' })
    }
    return comment
  })

  // Create comment on a ticket by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/comments', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    const parseResult = createCommentSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const ticketId = resolveTicketId(request.params.projectId, ticketNumber)
      const comment = commentService.create({
        ticket_id: ticketId,
        ...parseResult.data,
      })
      return reply.status(201).send(comment)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      throw error
    }
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

    try {
      const comment = commentService.update(id, parseResult.data)
      return comment
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Comment not found' })
      }
      throw error
    }
  })

  // Delete comment
  fastify.delete<{
    Params: { id: string }
  }>('/comments/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    try {
      commentService.delete(id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Comment not found' })
      }
      throw error
    }
  })

  // Get mentions in a comment
  fastify.get<{
    Params: { id: string }
  }>('/comments/:id/mentions', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid comment ID' })
    }

    return commentService.getMentions(id)
  })
}
