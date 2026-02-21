import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type {
  CommentWithAuthor,
  EventWithActor,
  PermissionLogEntry,
  Profile,
  PublicSession,
} from '@kombuse/types'
import { CommentItem } from '../comments/comment-item'
import { TimelineEventItem } from '../timeline/timeline-event-item'
import { PermissionItem } from '../permissions/permission-item'
import { useSessionByKombuseId } from '../../hooks/use-sessions'

vi.mock('../../hooks/use-sessions', () => ({
  useSessionByKombuseId: vi.fn(),
}))

vi.mock('../../hooks/use-textarea-autocomplete', () => ({
  useTextareaAutocomplete: () => ({
    textareaProps: {
      onChange: vi.fn(),
      onKeyDown: vi.fn(),
    },
    AutocompletePortal: () => null,
  }),
}))

vi.mock('../../hooks/use-file-staging', () => ({
  useFileStaging: () => ({
    stagedFiles: [],
    previewUrls: [],
    isDragOver: false,
    hasFiles: false,
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    dragHandlers: {},
    handlePaste: vi.fn(),
    fileInputRef: { current: null },
    handleFileInputChange: vi.fn(),
  }),
}))

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    type: 'user',
    name: 'User One',
    slug: null,
    email: null,
    description: null,
    avatar_url: null,
    external_source: null,
    external_id: null,
    plugin_id: null,
    is_active: true,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    ...overrides,
  }
}

function buildComment(overrides: Partial<CommentWithAuthor> = {}): CommentWithAuthor {
  return {
    id: 1,
    ticket_id: 321,
    author_id: 'user-1',
    parent_id: null,
    kombuse_session_id: 'trigger-session-1',
    body: 'Comment body',
    external_source: null,
    external_id: null,
    synced_at: null,
    is_edited: false,
    created_at: '2026-02-14T00:00:00.000Z',
    updated_at: '2026-02-14T00:00:00.000Z',
    author: buildProfile(),
    ...overrides,
  }
}

function buildEvent(overrides: Partial<EventWithActor> = {}): EventWithActor {
  return {
    id: 1,
    event_type: 'comment.added',
    project_id: '1',
    ticket_id: 777,
    comment_id: null,
    actor_id: 'user-1',
    actor_type: 'user',
    kombuse_session_id: 'trigger-session-2',
    payload: '{}',
    created_at: '2026-02-14T00:00:00.000Z',
    actor: buildProfile(),
    ...overrides,
  }
}

function buildPermissionEntry(overrides: Partial<PermissionLogEntry> = {}): PermissionLogEntry {
  return {
    id: 1,
    session_id: 'db-session-1',
    kombuse_session_id: 'trigger-session-3',
    ticket_id: 88,
    ticket_title: 'Review permissions',
    requested_at: '2026-02-14T00:00:00.000Z',
    request_id: 'req-1',
    tool_name: 'Bash',
    description: 'Run command',
    input: { command: 'ls -la' },
    auto_approved: false,
    behavior: 'allow',
    deny_message: null,
    resolved_at: '2026-02-14T00:00:01.000Z',
    ...overrides,
  }
}

describe('Session-aware navigation links', () => {
  const mockUseSessionByKombuseId = vi.mocked(useSessionByKombuseId)

  beforeEach(() => {
    mockUseSessionByKombuseId.mockReset()
  })

  it('uses comment ticket id fallback when linked session lacks ticket id', () => {
    mockUseSessionByKombuseId.mockReturnValue({
      data: {
        kombuse_session_id: 'trigger-session-1',
        ticket_id: null,
      } as PublicSession,
    } as ReturnType<typeof useSessionByKombuseId>)

    render(
      <MemoryRouter>
        <CommentItem comment={buildComment()} projectId="1" />
      </MemoryRouter>
    )

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/projects/1/tickets/321?session=trigger-session-1')
  })

  it('uses event ticket id fallback when linked session lacks ticket id', () => {
    mockUseSessionByKombuseId.mockReturnValue({
      data: {
        kombuse_session_id: 'trigger-session-2',
        ticket_id: null,
      } as PublicSession,
    } as ReturnType<typeof useSessionByKombuseId>)

    render(
      <MemoryRouter>
        <TimelineEventItem event={buildEvent()} projectId="1" />
      </MemoryRouter>
    )

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/projects/1/tickets/777?session=trigger-session-2')
  })

  it('merges session id into the ticket link for permission items', () => {
    render(
      <MemoryRouter>
        <PermissionItem entry={buildPermissionEntry()} projectId="1" />
      </MemoryRouter>
    )

    const ticketLink = screen.getByRole('link', { name: /#88 Review permissions/ })
    expect(ticketLink.getAttribute('href')).toBe('/projects/1/tickets/88?session=trigger-session-3')
    expect(screen.queryByRole('link', { name: 'Session' })).toBeNull()
  })

  it('uses chat link for permission items when ticket id is missing', () => {
    render(
      <MemoryRouter>
        <PermissionItem
          entry={buildPermissionEntry({
            ticket_id: null,
            ticket_title: null,
            kombuse_session_id: 'trigger-session-4',
          })}
          projectId="1"
        />
      </MemoryRouter>
    )

    const sessionLink = screen.getByRole('link', { name: 'Session' })
    expect(sessionLink.getAttribute('href')).toBe('/projects/1/chats/trigger-session-4')
  })
})
