import type { FastifyInstance } from 'fastify'
import { agentService, agentExportService } from '@kombuse/services'
import { eventsRepository } from '@kombuse/persistence'
import {
  createAgentSchema,
  updateAgentSchema,
  agentFiltersSchema,
  createTriggerSchema,
  updateTriggerSchema,
  invocationFiltersSchema,
  processEventSchema,
  agentExportSchema,
} from '../schemas/agents'

export async function agentRoutes(fastify: FastifyInstance) {
  // ============================================
  // Agent CRUD
  // ============================================

  // List agents with optional filters
  fastify.get('/agents', async (request, reply) => {
    const parseResult = agentFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return agentService.listAgents(parseResult.data)
  })

  // Get single agent
  fastify.get<{
    Params: { id: string }
  }>('/agents/:id', async (request, reply) => {
    const agent = agentService.getAgent(request.params.id)
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' })
    }
    return agent
  })

  // Create agent
  fastify.post('/agents', async (request, reply) => {
    const parseResult = createAgentSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const agent = agentService.createAgent(parseResult.data)
      return reply.status(201).send(agent)
    } catch (error) {
      const message = (error as Error).message
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message })
      }
      if (message.includes('not of type')) {
        return reply.status(409).send({ error: message })
      }
      throw error
    }
  })

  // Update agent
  fastify.patch<{
    Params: { id: string }
  }>('/agents/:id', async (request, reply) => {
    const parseResult = updateAgentSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const agent = agentService.updateAgent(request.params.id, parseResult.data)
      return agent
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // Delete agent
  fastify.delete<{
    Params: { id: string }
  }>('/agents/:id', async (request, reply) => {
    try {
      agentService.deleteAgent(request.params.id)
      return reply.status(204).send()
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // ============================================
  // Trigger CRUD (nested under agents)
  // ============================================

  // List triggers for an agent
  fastify.get<{
    Params: { agentId: string }
  }>('/agents/:agentId/triggers', async (request, reply) => {
    const agent = agentService.getAgent(request.params.agentId)
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' })
    }

    return agentService.listTriggers(request.params.agentId)
  })

  // Get single trigger
  fastify.get<{
    Params: { id: string }
  }>('/triggers/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid trigger ID' })
    }

    const trigger = agentService.getTrigger(id)
    if (!trigger) {
      return reply.status(404).send({ error: 'Trigger not found' })
    }
    return trigger
  })

  // Create trigger for an agent
  fastify.post<{
    Params: { agentId: string }
  }>('/agents/:agentId/triggers', async (request, reply) => {
    const parseResult = createTriggerSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const trigger = agentService.createTrigger({
        agent_id: request.params.agentId,
        ...parseResult.data,
      })
      return reply.status(201).send(trigger)
    } catch (error) {
      const message = (error as Error).message
      if (message.includes('not found')) {
        return reply.status(404).send({ error: message })
      }
      throw error
    }
  })

  // Update trigger
  fastify.patch<{
    Params: { id: string }
  }>('/triggers/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid trigger ID' })
    }

    const parseResult = updateTriggerSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const trigger = agentService.updateTrigger(id, parseResult.data)
      return trigger
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // Delete trigger
  fastify.delete<{
    Params: { id: string }
  }>('/triggers/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid trigger ID' })
    }

    try {
      agentService.deleteTrigger(id)
      return reply.status(204).send()
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message })
    }
  })

  // ============================================
  // Invocations (read-only)
  // ============================================

  // List invocations with filters
  fastify.get('/invocations', async (request, reply) => {
    const parseResult = invocationFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return agentService.listInvocations(parseResult.data)
  })

  // Get single invocation
  fastify.get<{
    Params: { id: string }
  }>('/invocations/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid invocation ID' })
    }

    const invocation = agentService.getInvocation(id)
    if (!invocation) {
      return reply.status(404).send({ error: 'Invocation not found' })
    }
    return invocation
  })

  // List invocations for an agent
  fastify.get<{
    Params: { agentId: string }
  }>('/agents/:agentId/invocations', async (request, reply) => {
    const agent = agentService.getAgent(request.params.agentId)
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' })
    }

    const parseResult = invocationFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return agentService.listInvocations({
      ...parseResult.data,
      agent_id: request.params.agentId,
    })
  })

  // ============================================
  // Event Processing
  // ============================================

  // Process an event - find matching triggers and create invocations
  fastify.post('/agents/process-event', async (request, reply) => {
    const parseResult = processEventSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    const event = eventsRepository.get(parseResult.data.event_id)
    if (!event) {
      return reply.status(404).send({ error: 'Event not found' })
    }

    const invocations = agentService.processEvent(event)
    return {
      event_id: event.id,
      invocations_created: invocations.length,
      invocations,
    }
  })

  // ============================================
  // Agent Export
  // ============================================

  // Export all agents to a directory as markdown files
  fastify.post('/agents/export', async (request, reply) => {
    const parseResult = agentExportSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const result = agentExportService.writeToDirectory(parseResult.data.directory)
      return result
    } catch (error) {
      const message = (error as Error).message
      if (
        message.includes('EACCES') ||
        message.includes('EPERM') ||
        message.includes('EROFS')
      ) {
        return reply.status(403).send({
          error: `Cannot write to directory: ${message}`,
        })
      }
      throw error
    }
  })
}
