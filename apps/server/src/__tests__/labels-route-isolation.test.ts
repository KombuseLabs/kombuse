import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  labelsRepository,
  setDatabase,
} from '@kombuse/persistence'
import {
  seedBaseData,
  seedMultiProjectData,
  TEST_PROJECT_ID,
  TEST_PROJECT_2_ID,
} from '@kombuse/persistence/test-utils'
import { labelRoutes } from '../routes/labels.routes'

describe('labels route cross-project isolation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)
    seedBaseData(db)
    seedMultiProjectData(db)

    // Create labels in project-1
    labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Bug', color: '#e5534b' })
    labelsRepository.create({ project_id: TEST_PROJECT_ID, name: 'Feature', color: '#986ee2' })

    app = Fastify()
    await app.register(labelRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('should only return labels from the requested project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/labels`,
    })

    expect(response.statusCode).toBe(200)
    const labels = response.json()
    expect(labels.length).toBe(2)
    expect(
      labels.every((l: { project_id: string }) => l.project_id === TEST_PROJECT_ID),
      'All returned labels should belong to the requested project'
    ).toBe(true)
  })

  it('should only return project-2 labels for project-2', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_2_ID}/labels`,
    })

    expect(response.statusCode).toBe(200)
    const labels = response.json()
    // seedMultiProjectData creates 1 label in project-2
    expect(labels.length).toBe(1)
    expect(labels[0].project_id).toBe(TEST_PROJECT_2_ID)
    expect(labels[0].name).toBe('Project 2 Label')
  })

  it('should not leak project-1 labels into project-2 results', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_2_ID}/labels`,
    })

    const labels = response.json()
    const labelNames = labels.map((l: { name: string }) => l.name)
    expect(labelNames).not.toContain('Bug')
    expect(labelNames).not.toContain('Feature')
  })
})
