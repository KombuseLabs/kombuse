import { describe, it, expect } from 'vitest'
import { renderTemplate, hasTemplateVariables } from '../template-engine'
import type { TemplateContext } from '@kombuse/types'

describe('renderTemplate', () => {
  const baseContext: TemplateContext = {
    event_type: 'ticket.created',
    ticket_id: 123,
    project_id: 'proj-abc',
    comment_id: null,
    actor_id: 'user-alice',
    actor_type: 'user',
    payload: { title: 'Bug fix needed', priority: 'high' },
  }

  it('should render simple variable substitution', () => {
    const template = 'Ticket #{{ ticket_id }} was created'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Ticket #123 was created')
  })

  it('should render nested payload access', () => {
    const template = 'Title: {{ payload.title }}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Title: Bug fix needed')
  })

  it('should render empty string for undefined variables', () => {
    const template = 'Comment: {{ comment_id }}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Comment: ')
  })

  it('should support conditionals', () => {
    const template = '{% if payload.priority == "high" %}URGENT{% endif %}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('URGENT')
  })

  it('should support else in conditionals', () => {
    const template = '{% if comment_id %}Has comment{% else %}No comment{% endif %}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('No comment')
  })

  it('should support default filter for undefined values', () => {
    const template = 'Missing: {{ missing_field | default("N/A") }}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Missing: N/A')
  })

  it('should support custom or filter for null values', () => {
    // Custom 'or' filter handles both null and undefined
    const template = 'Comment: {{ comment_id | or("N/A") }}'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Comment: N/A')
  })

  it('should support loops', () => {
    const contextWithLabels: TemplateContext = {
      ...baseContext,
      ticket: {
        id: 123,
        project_id: 'proj-abc',
        author_id: 'user-alice',
        assignee_id: null,
        claimed_by_id: null,
        title: 'Test',
        body: null,
        status: 'open',
        priority: 2,
        milestone_id: null,
        external_source: null,
        external_id: null,
        external_url: null,
        synced_at: null,
        claimed_at: null,
        claim_expires_at: null,
        triggers_enabled: true,
        loop_protection_enabled: true,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        opened_at: '2024-01-01',
        closed_at: null,
        last_activity_at: '2024-01-01',
        labels: [
          { id: 1, project_id: 'proj-abc', name: 'bug', color: 'red', description: null, plugin_id: null, created_at: '2024-01-01' },
          { id: 2, project_id: 'proj-abc', name: 'urgent', color: 'orange', description: null, plugin_id: null, created_at: '2024-01-01' },
        ],
      },
    }
    const template = 'Labels: {% for label in ticket.labels %}{{ label.name }}{% if not loop.last %}, {% endif %}{% endfor %}'
    const result = renderTemplate(template, contextWithLabels)
    expect(result).toBe('Labels: bug, urgent')
  })

  it('should return template unchanged if no variables', () => {
    const template = 'Plain text without variables'
    const result = renderTemplate(template, baseContext)
    expect(result).toBe('Plain text without variables')
  })

  it('should handle enriched ticket context', () => {
    const contextWithTicket: TemplateContext = {
      ...baseContext,
      ticket: {
        id: 123,
        project_id: 'proj-abc',
        author_id: 'user-alice',
        assignee_id: 'user-bob',
        claimed_by_id: null,
        title: 'Fix login bug',
        body: 'The login button is broken',
        status: 'open',
        priority: 4,
        milestone_id: null,
        external_source: null,
        external_id: null,
        external_url: null,
        synced_at: null,
        claimed_at: null,
        claim_expires_at: null,
        triggers_enabled: true,
        loop_protection_enabled: true,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        opened_at: '2024-01-01',
        closed_at: null,
        last_activity_at: '2024-01-01',
        author: {
          id: 'user-alice',
          type: 'user',
          name: 'Alice',
          email: 'alice@example.com',
          description: null,
          avatar_url: null,
          external_source: null,
          external_id: null,
          is_active: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        assignee: {
          id: 'user-bob',
          type: 'user',
          name: 'Bob',
          email: 'bob@example.com',
          description: null,
          avatar_url: null,
          external_source: null,
          external_id: null,
          is_active: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        labels: [],
      },
    }
    const template = 'Ticket: {{ ticket.title }} (by {{ ticket.author.name }}, assigned to {{ ticket.assignee.name }})'
    const result = renderTemplate(template, contextWithTicket)
    expect(result).toBe('Ticket: Fix login bug (by Alice, assigned to Bob)')
  })
})

describe('hasTemplateVariables', () => {
  it('should return true for variable syntax', () => {
    expect(hasTemplateVariables('Hello {{ name }}')).toBe(true)
  })

  it('should return true for control syntax', () => {
    expect(hasTemplateVariables('{% if x %}yes{% endif %}')).toBe(true)
  })

  it('should return true for comment syntax', () => {
    expect(hasTemplateVariables('{# comment #}')).toBe(true)
  })

  it('should return false for plain text', () => {
    expect(hasTemplateVariables('Hello world')).toBe(false)
  })

  it('should return false for JSON-like braces', () => {
    expect(hasTemplateVariables('{"key": "value"}')).toBe(false)
  })
})
