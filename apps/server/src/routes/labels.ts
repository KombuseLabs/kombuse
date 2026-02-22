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

  // Add label to ticket by project-scoped number
  fastify.post<{
    Params: { projectId: string; number: string; labelId: string }
    Body: { added_by_id?: string }
  }>('/projects/:projectId/tickets/by-number/:number/labels/:labelId', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1 || isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid ticket number or label ID' })
    }

    const addedById = (request.body as { added_by_id?: string })?.added_by_id
    try {
      labelService.addToTicket(request.params.projectId, ticketNumber, labelId, addedById)
      return reply.status(201).send({ success: true })
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      throw error
    }
  })

  // Remove label from ticket by project-scoped number
  fastify.delete<{
    Params: { projectId: string; number: string; labelId: string }
    Body: { removed_by_id?: string }
  }>('/projects/:projectId/tickets/by-number/:number/labels/:labelId', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    const labelId = parseInt(request.params.labelId, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1 || isNaN(labelId)) {
      return reply.status(400).send({ error: 'Invalid ticket number or label ID' })
    }

    const removedById = (request.body as { removed_by_id?: string })?.removed_by_id
    try {
      labelService.removeFromTicket(request.params.projectId, ticketNumber, labelId, removedById)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      if (error instanceof Error && error.message.includes('not attached')) {
        return reply.status(404).send({ error: 'Label not attached to ticket' })
      }
      throw error
    }
  })

  // Get labels for a ticket by project-scoped number
  fastify.get<{
    Params: { projectId: string; number: string }
  }>('/projects/:projectId/tickets/by-number/:number/labels', async (request, reply) => {
    const ticketNumber = parseInt(request.params.number, 10)
    if (isNaN(ticketNumber) || ticketNumber < 1) {
      return reply.status(400).send({ error: 'Invalid ticket number' })
    }

    try {
      return labelService.getTicketLabels(request.params.projectId, ticketNumber)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Ticket not found' })
      }
      throw error
    }
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
