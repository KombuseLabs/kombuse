import type { FastifyInstance } from 'fastify'
import { analyticsService } from '@kombuse/services'
import {
  sessionsPerDayQuerySchema,
  durationPercentilesQuerySchema,
  pipelineStageDurationQuerySchema,
  mostFrequentReadsQuerySchema,
  toolCallsPerSessionQuerySchema,
  slowestToolsQuerySchema,
  toolCallVolumeQuerySchema,
  ticketBurndownQuerySchema,
  agentRuntimePerTicketQuerySchema,
} from '../schemas/analytics.schema'

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/analytics/sessions-per-day', async (request, reply) => {
    const parseResult = sessionsPerDayQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.sessionsPerDay(project_id, days)
    } catch (error) {
      request.log.error({ err: error, route: 'sessionsPerDay', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/duration-percentiles', async (request, reply) => {
    const parseResult = durationPercentilesQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.durationPercentiles(project_id, days)
    } catch (error) {
      request.log.error({ err: error, route: 'durationPercentiles', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/pipeline-stage-duration', async (request, reply) => {
    const parseResult = pipelineStageDurationQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.pipelineStageDuration(project_id, days)
    } catch (error) {
      request.log.error({ err: error, route: 'pipelineStageDuration', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/most-frequent-reads', async (request, reply) => {
    const parseResult = mostFrequentReadsQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days, limit } = parseResult.data
      return analyticsService.mostFrequentReads(project_id, days, limit)
    } catch (error) {
      request.log.error({ err: error, route: 'mostFrequentReads', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/tool-calls-per-session', async (request, reply) => {
    const parseResult = toolCallsPerSessionQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days, agent_id } = parseResult.data
      return analyticsService.toolCallsPerSession(project_id, days, agent_id)
    } catch (error) {
      request.log.error({ err: error, route: 'toolCallsPerSession', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/slowest-tools', async (request, reply) => {
    const parseResult = slowestToolsQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.slowestTools(project_id, days)
    } catch (error) {
      request.log.error({ err: error, route: 'slowestTools', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/tool-call-volume', async (request, reply) => {
    const parseResult = toolCallVolumeQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days } = parseResult.data
      return analyticsService.toolCallVolume(project_id, days)
    } catch (error) {
      request.log.error({ err: error, route: 'toolCallVolume', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/ticket-burndown', async (request, reply) => {
    const parseResult = ticketBurndownQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, days, milestone_id, label_id } = parseResult.data
      return analyticsService.ticketBurndown(project_id, days, milestone_id, label_id)
    } catch (error) {
      request.log.error({ err: error, route: 'ticketBurndown', params: request.query })
      throw error
    }
  })

  fastify.get('/analytics/agent-runtime-per-ticket', async (request, reply) => {
    const parseResult = agentRuntimePerTicketQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const { project_id, limit } = parseResult.data
      return analyticsService.agentRuntimePerTicket(project_id, limit)
    } catch (error) {
      request.log.error({ err: error, route: 'agentRuntimePerTicket', params: request.query })
      throw error
    }
  })
}
