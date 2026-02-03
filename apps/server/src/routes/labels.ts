import type { FastifyInstance } from 'fastify'
import { labelsRepository } from '@kombuse/persistence'
import {
  createLabelSchema,
  updateLabelSchema,
  labelFiltersSchema,
} from '../schemas/labels'

export async function labelRoutes(fastify: FastifyInstance) {
  // List labels for a project
  fastify.get<{
    Params: { projectId: string }
  }>('/projects/:projectId/labels', async (request, reply) => {
    const parseResult = labelFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return labelsRepository.list({
      project_id: request.params.projectId,
      ...parseResult.data,
    })
  })

  // Get single label
  fastify.get<{
    Params: { id: string }
  }>('/labels/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid label ID' })
    }

    const label = labelsRepository.get(id)
    if (!label) {
      return reply.status(404).send({ error: 'Label not found' })
    }
    return label
  })

  // Create label for a project
  fastify.post<{
    Params: { projectId: string }
  }>('/projects/:projectId/labels', async (request, reply) => {
    const parseResult = createLabelSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const label = labelsRepository.create({
      project_id: request.params.projectId,
      ...parseResult.data,
    })
    return reply.status(201).send(label)
  })

  // Update label
  fastify.patch<{
    Params: { id: string }
  }>('/labels/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid label ID' })
    }

    const parseResult = updateLabelSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const label = labelsRepository.update(id, parseResult.data)
    if (!label) {
      return reply.status(404).send({ error: 'Label not found' })
    }
    return label
  })

  // Delete label
  fastify.delete<{
    Params: { id: string }
  }>('/labels/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid label ID' })
    }

    const deleted = labelsRepository.delete(id)
    if (!deleted) {
      return reply.status(404).send({ error: 'Label not found' })
    }
    return reply.status(204).send()
  })

  // Add label to ticket
  fastify.post<{
    Params: { ticketId: string; labelId: string }
    Body: { added_by_id?: string }
  }>('/tickets/:ticketId/labels/:labelId', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(ticketId) || isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid ticket or label ID' })
    }

    const addedById = (request.body as { added_by_id?: string })?.added_by_id
    labelsRepository.addToTicket(ticketId, labelId, addedById)
    return reply.status(201).send({ success: true })
  })

  // Remove label from ticket
  fastify.delete<{
    Params: { ticketId: string; labelId: string }
  }>('/tickets/:ticketId/labels/:labelId', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(ticketId) || isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid ticket or label ID' })
    }

    const removed = labelsRepository.removeFromTicket(ticketId, labelId)
    if (!removed) {
      return reply.status(404).send({ error: 'Label not attached to ticket' })
    }
    return reply.status(204).send()
  })

  // Get labels for a ticket
  fastify.get<{
    Params: { ticketId: string }
  }>('/tickets/:ticketId/labels', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    return labelsRepository.getTicketLabels(ticketId)
  })
}
