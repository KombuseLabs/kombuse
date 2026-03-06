import { describe, expect, it } from 'vitest'
import { getSuccessResponseSchema } from '../schemas/route-responses.schema'

describe('project route response schemas allow warning field', () => {
  const projectPayload = {
    id: 'test-id',
    name: 'Test Project',
    slug: 'test-project',
    description: null,
    owner_id: 'user-1',
    local_path: '/tmp/test',
    repo_source: null,
    repo_owner: null,
    repo_name: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }

  it('POST /api/projects schema preserves the warning field', () => {
    const schema = getSuccessResponseSchema('POST /api/projects')
    expect(schema).toBeDefined()

    const withWarning = { ...projectPayload, warning: 'Codex configuration failed: test error' }
    const result = schema!.safeParse(withWarning)

    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).warning).toBe('Codex configuration failed: test error')
    }
  })

  it('POST /api/projects schema allows response without warning field', () => {
    const schema = getSuccessResponseSchema('POST /api/projects')
    expect(schema).toBeDefined()

    const result = schema!.safeParse(projectPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).warning).toBeUndefined()
    }
  })

  it('PATCH /api/projects/:id schema preserves the warning field', () => {
    const schema = getSuccessResponseSchema('PATCH /api/projects/:id')
    expect(schema).toBeDefined()

    const withWarning = { ...projectPayload, warning: 'Codex configuration failed: test error' }
    const result = schema!.safeParse(withWarning)

    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).warning).toBe('Codex configuration failed: test error')
    }
  })

  it('GET /api/projects schema does NOT include warning field', () => {
    const schema = getSuccessResponseSchema('GET /api/projects')
    expect(schema).toBeDefined()

    const withWarning = [{ ...projectPayload, warning: 'should be stripped' }]
    const result = schema!.safeParse(withWarning)

    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>[])[0]?.warning).toBeUndefined()
    }
  })
})
