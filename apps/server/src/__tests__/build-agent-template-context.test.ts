import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDesktopContext = {
  docs_db_exists: false,
  docs_db_project_count: 0,
  docs_db_ticket_count: 0,
  demo_project_id: null,
}

vi.mock('../services/agent-execution-service/chat-session-runner', () => ({
  resolveDesktopContext: () => mockDesktopContext,
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockTicket = {
  id: 100,
  ticket_number: 42,
  project_id: 'proj-1',
  title: 'Test ticket',
  body: 'body',
  status: 'open',
  priority: null,
  author_id: 'author-1',
  assignee_id: 'assignee-1',
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  last_activity_at: '2025-01-01',
} as any

const mockProfile = { id: 'author-1', type: 'user', name: 'Author', description: null } as any
const mockAssignee = { id: 'assignee-1', type: 'user', name: 'Assignee', description: null } as any
const mockProject = { id: 'proj-1', name: 'Test Project', owner_id: 'owner-1' } as any
const mockLabels = [{ id: 1, project_id: 'proj-1', name: 'bug', color: '#ff0000' }] as any
const mockAgentProfile = { id: 'agent-1', type: 'agent', name: 'Test Agent', description: 'An agent' } as any

vi.mock('@kombuse/persistence', () => ({
  ticketsRepository: {
    _getInternal: vi.fn(),
  },
  profilesRepository: {
    get: vi.fn(),
    list: vi.fn(() => []),
  },
  projectsRepository: {
    get: vi.fn(),
  },
  labelsRepository: {
    getTicketLabels: vi.fn(() => []),
  },
  agentsRepository: {
    get: vi.fn(),
  },
}))

vi.mock('@kombuse/services', () => ({
  buildTemplateContext: vi.fn((event: { event_type: string; ticket_id: number | null; project_id: string | null }) => ({
    event_type: event.event_type,
    ticket_id: event.ticket_id,
    ticket_number: null,
    project_id: event.project_id,
    comment_id: null,
    actor_id: null,
    actor_type: 'user' as const,
    payload: {},
  })),
}))

import {
  ticketsRepository,
  profilesRepository,
  projectsRepository,
  labelsRepository,
  agentsRepository,
} from '@kombuse/persistence'
import { buildTemplateContext } from '@kombuse/services'
import { buildAgentTemplateContext } from '../services/agent-execution-service/template-context'

describe('buildAgentTemplateContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('direct mode (no event)', () => {
    it('returns base context with empty event fields when no ticketId/projectId', () => {
      const ctx = buildAgentTemplateContext({
        kombuseSessionId: 'ses_test123',
        backendType: 'claude-code',
      })

      expect(ctx.event_type).toBe('')
      expect(ctx.ticket_id).toBeNull()
      expect(ctx.ticket_number).toBeNull()
      expect(ctx.project_id).toBeNull()
      expect(ctx.comment_id).toBeNull()
      expect(ctx.actor_id).toBeNull()
      expect(ctx.actor_type).toBe('user')
      expect(ctx.payload).toEqual({})
    })

    it('always includes kombuse_session_id and backend_type', () => {
      const ctx = buildAgentTemplateContext({
        kombuseSessionId: 'ses_abc',
        backendType: 'codex',
      })

      expect(ctx.kombuse_session_id).toBe('ses_abc')
      expect(ctx.backend_type).toBe('codex')
    })

    it('always includes desktop_context', () => {
      const ctx = buildAgentTemplateContext({
        kombuseSessionId: 'ses_test',
        backendType: 'claude-code',
      })

      expect(ctx.desktop_context).toEqual(mockDesktopContext)
    })

    it('enriches ticket with author, assignee, and labels when ticketId is provided', () => {
      vi.mocked(ticketsRepository._getInternal).mockReturnValue(mockTicket as any)
      vi.mocked(profilesRepository.get).mockImplementation(((id: string) => {
        if (id === 'author-1') return mockProfile
        if (id === 'assignee-1') return mockAssignee
        return null
      }) as any)
      vi.mocked(labelsRepository.getTicketLabels).mockReturnValue(mockLabels as any)

      const ctx = buildAgentTemplateContext({
        ticketId: 100,
        kombuseSessionId: 'ses_test',
        backendType: 'claude-code',
      })

      expect(ctx.ticket).toBeDefined()
      expect(ctx.ticket!.author).toEqual(mockProfile)
      expect(ctx.ticket!.assignee).toEqual(mockAssignee)
      expect(ctx.ticket!.labels).toEqual(mockLabels)
      expect(ctx.ticket_number).toBe(42)
    })

    it('sets ticket_number from the fetched ticket record', () => {
      vi.mocked(ticketsRepository._getInternal).mockReturnValue(mockTicket as any)

      const ctx = buildAgentTemplateContext({
        ticketId: 100,
        kombuseSessionId: 'ses_test',
        backendType: 'claude-code',
      })

      expect(ctx.ticket_number).toBe(42)
    })

    it('enriches project when projectId is provided', () => {
      vi.mocked(projectsRepository.get).mockReturnValue(mockProject as any)

      const ctx = buildAgentTemplateContext({
        projectId: 'proj-1',
        kombuseSessionId: 'ses_test',
        backendType: 'claude-code',
      })

      expect(ctx.project).toEqual(mockProject)
    })

    it('populates agents directory', () => {
      vi.mocked(profilesRepository.list).mockReturnValue([mockAgentProfile] as any)
      vi.mocked(agentsRepository.get).mockReturnValue({
        id: 'agent-1',
        slug: 'test-agent',
        system_prompt: '',
        permissions: [],
        config: {},
        is_enabled: true,
        plugin_id: null,
        project_id: null,
        plugin_base: null,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      } as any)

      const ctx = buildAgentTemplateContext({
        projectId: 'proj-1',
        kombuseSessionId: 'ses_test',
        backendType: 'claude-code',
      })

      expect(ctx.agents).toEqual([
        { id: 'agent-1', name: 'Test Agent', description: 'An agent', slug: 'test-agent' },
      ])
    })
  })

  describe('event mode', () => {
    const mockEvent = {
      id: 1,
      event_type: 'ticket.created',
      ticket_id: 200,
      ticket_number: 10,
      project_id: 'proj-2',
      comment_id: null,
      actor_id: 'user-1',
      actor_type: 'user' as const,
      kombuse_session_id: null,
      payload: '{}',
      created_at: '2025-01-01',
    }

    it('delegates to buildTemplateContext and appends shared fields', () => {
      const ctx = buildAgentTemplateContext({
        event: mockEvent,
        kombuseSessionId: 'ses_trigger',
        backendType: 'claude-code',
      })

      expect(buildTemplateContext).toHaveBeenCalledWith(mockEvent)
      expect(ctx.event_type).toBe('ticket.created')
      expect(ctx.kombuse_session_id).toBe('ses_trigger')
      expect(ctx.backend_type).toBe('claude-code')
      expect(ctx.desktop_context).toEqual(mockDesktopContext)
    })

    it('always attaches desktop_context, kombuse_session_id, and backend_type', () => {
      const ctx = buildAgentTemplateContext({
        event: mockEvent,
        kombuseSessionId: 'ses_xyz',
        backendType: 'codex',
      })

      expect(ctx.kombuse_session_id).toBe('ses_xyz')
      expect(ctx.backend_type).toBe('codex')
      expect(ctx.desktop_context).toBeDefined()
      expect(ctx.desktop_context).toEqual(mockDesktopContext)
    })
  })
})
