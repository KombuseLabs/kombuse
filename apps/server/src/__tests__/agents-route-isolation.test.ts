import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  agentsRepository,
  profilesRepository,
  setDatabase,
} from '@kombuse/persistence'
import {
  seedBaseData,
  seedMultiProjectData,
  TEST_PROJECT_ID,
  TEST_PROJECT_2_ID,
} from '@kombuse/persistence/test-utils'
import { agentRoutes } from '../routes/agents.routes'

describe('agents route cross-project isolation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)
    seedBaseData(db)
    seedMultiProjectData(db)

    // Create a project-1-scoped agent
    profilesRepository.create({
      id: 'agent-p1',
      type: 'agent',
      name: 'Project 1 Agent',
    })
    agentsRepository.create({
      id: 'agent-p1',
      name: 'Project 1 Agent',
      description: 'Scoped to project 1',
      system_prompt: 'Test agent for project 1',
      slug: 'project-1-agent',
      project_id: TEST_PROJECT_ID,
    })

    // Create a global agent (no project_id)
    profilesRepository.create({
      id: 'agent-global',
      type: 'agent',
      name: 'Global Agent',
    })
    agentsRepository.create({
      id: 'agent-global',
      name: 'Global Agent',
      description: 'Available everywhere',
      system_prompt: 'Global test agent',
      slug: 'global-agent',
    })

    app = Fastify()
    await app.register(agentRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should return project-1 agents and global agents when filtering by project-1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/agents?project_id=${TEST_PROJECT_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const agents = response.json()
    const agentIds = agents.map((a: { id: string }) => a.id)

    expect(agentIds, 'Should include project-1 agent').toContain('agent-p1')
    expect(agentIds, 'Should include global agent').toContain('agent-global')
    expect(agentIds, 'Should not include project-2 agent').not.toContain('test-agent-project-2')
  })

  it('should return project-2 agents and global agents when filtering by project-2', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/agents?project_id=${TEST_PROJECT_2_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const agents = response.json()
    const agentIds = agents.map((a: { id: string }) => a.id)

    // seedMultiProjectData creates 'test-agent-project-2' scoped to project-2
    expect(agentIds, 'Should include project-2 agent').toContain('test-agent-project-2')
    expect(agentIds, 'Should include global agent').toContain('agent-global')
    expect(agentIds, 'Should not include project-1 agent').not.toContain('agent-p1')
  })
})
