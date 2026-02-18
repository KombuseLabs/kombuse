import type { FastifyInstance } from 'fastify'
import { labelService, agentService } from '@kombuse/services'
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

    return labelService.list({
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

    const label = labelService.get(id)
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

    const label = labelService.create({
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

    try {
      const label = labelService.update(id, parseResult.data)
      return label
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Label not found' })
      }
      throw error
    }
  })

  // Delete label
  fastify.delete<{
    Params: { id: string }
  }>('/labels/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid label ID' })
    }

    try {
      labelService.delete(id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Label not found' })
      }
      throw error
    }
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
    labelService.addToTicket(ticketId, labelId, addedById)
    return reply.status(201).send({ success: true })
  })

  // Remove label from ticket
  fastify.delete<{
    Params: { ticketId: string; labelId: string }
    Body: { removed_by_id?: string }
  }>('/tickets/:ticketId/labels/:labelId', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(ticketId) || isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid ticket or label ID' })
    }

    const removedById = (request.body as { removed_by_id?: string })?.removed_by_id
    try {
      labelService.removeFromTicket(ticketId, labelId, removedById)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not attached')) {
        return reply.status(404).send({ error: 'Label not attached to ticket' })
      }
      throw error
    }
  })

  // Get labels for a ticket
  fastify.get<{
    Params: { ticketId: string }
  }>('/tickets/:ticketId/labels', async (request, reply) => {
    const ticketId = parseInt(request.params.ticketId, 10)
    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' })
    }

    return labelService.getTicketLabels(ticketId)
  })

  // Get triggers that reference a label
  fastify.get<{
    Params: { labelId: string }
  }>('/labels/:labelId/triggers', async (request, reply) => {
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid label ID' })
    }

    const label = labelService.get(labelId)
    if (!label) {
      return reply.status(404).send({ error: 'Label not found' })
    }

    return agentService.listTriggersByLabelId(labelId)
  })

  // Get smart label IDs for a project (labels with enabled agent triggers)
  fastify.get<{
    Params: { projectId: string }
  }>('/projects/:projectId/smart-label-ids', async (request) => {
    const labelIds = agentService.listSmartLabelIds(request.params.projectId)
    return { label_ids: labelIds }
  })
}
