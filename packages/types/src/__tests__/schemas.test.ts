import { describe, expect, it } from 'vitest'
import type { AgentConfig, AgentInvocation, Permission } from '../agents'
import type { DatabaseQueryResponse } from '../database'
import type { Profile } from '../profiles'
import type { Project } from '../projects'
import type { Ticket } from '../tickets'
import type { TicketTimeline } from '../timeline'
import {
  agentConfigSchema,
  agentProcessEventResponseSchema,
  apiErrorSchema,
  claudeCodeSessionResponseSchema,
  databaseQueryResponseSchema,
  permissionSchema,
  profileSchema,
  projectSchema,
  ticketSchema,
  ticketTimelineResponseSchema,
} from '../schemas'

const ts = '2026-02-14 23:40:00'

describe('shared agent schemas', () => {
  it('parses permissions and matches Permission type', () => {
    const parsed = permissionSchema.parse({
      type: 'resource',
      resource: 'ticket',
      actions: ['read', 'update'],
      scope: 'project',
      filter: 'project:proj-1',
    })

    const typedPermission: Permission = parsed
    expect(typedPermission.type).toBe('resource')
  })

  it('keeps extra config keys while validating known fields', () => {
    const parsed = agentConfigSchema.parse({
      backend_type: 'codex',
      max_tokens: 4096,
      custom_setting: 'keep-me',
    })

    const typedConfig: AgentConfig = parsed
    expect(typedConfig.backend_type).toBe('codex')
    expect((typedConfig as Record<string, unknown>).custom_setting).toBe('keep-me')
  })
})

describe('shared entity schemas', () => {
  it('parses profile/project/ticket payloads with type compatibility', () => {
    const profile = profileSchema.parse({
      id: 'user-1',
      type: 'user',
      name: 'Alice',
      email: null,
      description: null,
      avatar_url: null,
      external_source: null,
      external_id: null,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    })

    const project = projectSchema.parse({
      id: 'proj-1',
      name: 'Kombuse',
      description: null,
      owner_id: 'user-1',
      local_path: '/tmp/repo',
      repo_source: 'github',
      repo_owner: 'kombuse',
      repo_name: 'mono',
      created_at: ts,
      updated_at: ts,
    })

    const ticket = ticketSchema.parse({
      id: 135,
      project_id: 'proj-1',
      author_id: 'user-1',
      assignee_id: null,
      claimed_by_id: null,
      title: 'Migrate to zod 4.x',
      body: null,
      triggers_enabled: true,
      loop_protection_enabled: true,
      status: 'in_progress',
      priority: 3,
      external_source: null,
      external_id: null,
      milestone_id: null,
      external_url: null,
      synced_at: null,
      claimed_at: null,
      claim_expires_at: null,
      created_at: ts,
      updated_at: ts,
      opened_at: ts,
      closed_at: null,
      last_activity_at: ts,
    })

    const typedProfile: Profile = profile
    const typedProject: Project = project
    const typedTicket: Ticket = ticket

    expect(typedProfile.id).toBe('user-1')
    expect(typedProject.id).toBe('proj-1')
    expect(typedTicket.id).toBe(135)
  })
})

describe('shared API schemas', () => {
  it('enforces standardized error envelope with top-level error', () => {
    const valid = apiErrorSchema.safeParse({
      error: 'Invalid ticket ID',
      code: 'validation_error',
      details: { field: 'ticketId' },
    })
    expect(valid.success).toBe(true)

    const invalid = apiErrorSchema.safeParse({ code: 'missing_error' })
    expect(invalid.success).toBe(false)
  })

  it('keeps database query rows permissive while validating envelope shape', () => {
    const parsed = databaseQueryResponseSchema.parse({
      rows: [
        { id: 1, title: 'A', nested: { a: 1 } },
        { id: 2, weird: ['x', 1, { y: true }] },
      ],
      count: 2,
      sql: 'select * from tickets',
    })

    const typed: DatabaseQueryResponse = parsed
    expect(typed.rows[1]?.weird).toBeDefined()
  })

  it('accepts permissive Claude session item/event payloads', () => {
    const parsed = claudeCodeSessionResponseSchema.parse({
      items: [
        { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } },
        { type: 'result', subtype: 'success', extra: { tokenUsage: 10 } },
      ],
      count: 2,
      events: [
        { type: 'message', role: 'assistant', content: 'hello' },
      ],
      validation: {
        valid: 2,
        invalid: 0,
        byType: {
          assistant: { valid: 1, invalid: 0 },
          result: { valid: 1, invalid: 0 },
        },
        errors: [],
      },
    })

    expect(parsed.count).toBe(2)
    expect(parsed.items[1]?.extra).toEqual({ tokenUsage: 10 })
  })

  it('validates agent process-event response shape', () => {
    const invocation: AgentInvocation = {
      id: 1,
      agent_id: 'planner',
      trigger_id: 10,
      event_id: 20,
      session_id: null,
      project_id: 'proj-1',
      kombuse_session_id: null,
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      run_at: ts,
      context: { ticket_id: 135 },
      result: null,
      error: null,
      started_at: null,
      completed_at: null,
      created_at: ts,
    }

    const parsed = agentProcessEventResponseSchema.parse({
      event_id: 20,
      invocations_created: 1,
      invocations: [invocation],
    })

    expect(parsed.invocations[0]?.agent_id).toBe('planner')
  })

  it('validates timeline response and stays compatible with TicketTimeline type', () => {
    const parsed = ticketTimelineResponseSchema.parse({
      items: [
        {
          type: 'comment',
          timestamp: ts,
          data: {
            id: 1,
            ticket_id: 135,
            author_id: 'user-1',
            parent_id: null,
            kombuse_session_id: null,
            body: 'hello',
            external_source: null,
            external_id: null,
            synced_at: null,
            is_edited: false,
            created_at: ts,
            updated_at: ts,
            author: {
              id: 'user-1',
              type: 'user',
              name: 'Alice',
              email: null,
              description: null,
              avatar_url: null,
              external_source: null,
              external_id: null,
              is_active: true,
              created_at: ts,
              updated_at: ts,
            },
          },
        },
        {
          type: 'event',
          timestamp: ts,
          data: {
            id: 20,
            event_type: 'comment.added',
            project_id: 'proj-1',
            ticket_id: 135,
            comment_id: 1,
            actor_id: 'user-1',
            actor_type: 'user',
            kombuse_session_id: null,
            payload: '{}',
            created_at: ts,
            actor: null,
          },
        },
      ],
      total: 2,
    })

    const typedTimeline: TicketTimeline = parsed
    expect(typedTimeline.total).toBe(2)
  })
})
