import { describe, it, expect } from 'vitest'
import type { AllowedInvoker, Profile } from '@kombuse/types'
import { summarizeInvokers } from '../allowed-invokers-editor'

function makeProfile(id: string, name: string): Profile {
  return {
    id,
    type: 'agent',
    name,
    email: null,
    description: null,
    avatar_url: null,
    external_source: null,
    external_id: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('summarizeInvokers', () => {
  it('returns null for null input', () => {
    expect(summarizeInvokers(null)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(summarizeInvokers([])).toBeNull()
  })

  it('returns "Anyone" for type: any', () => {
    expect(summarizeInvokers([{ type: 'any' }])).toBe('Anyone')
  })

  it('returns "Users" for type: user', () => {
    expect(summarizeInvokers([{ type: 'user' }])).toBe('Users')
  })

  it('returns "System" for type: system', () => {
    expect(summarizeInvokers([{ type: 'system' }])).toBe('System')
  })

  it('returns "Any agent" for type: agent with no agent_id or agent_type', () => {
    expect(summarizeInvokers([{ type: 'agent' }])).toBe('Any agent')
  })

  it('resolves agent_id to profile name when profileMap has a match', () => {
    const id = 'f45f1640-30fe-47d7-a286-a6b8e1dc1629'
    const profileMap = new Map<string, Profile>()
    profileMap.set(id, makeProfile(id, 'Kombuse'))

    expect(summarizeInvokers([{ type: 'agent', agent_id: id }], profileMap)).toBe('Kombuse')
  })

  it('falls back to truncated UUID when agent_id is not in profileMap', () => {
    const id = 'f45f1640-30fe-47d7-a286-a6b8e1dc1629'
    const profileMap = new Map<string, Profile>()

    expect(summarizeInvokers([{ type: 'agent', agent_id: id }], profileMap)).toBe('agent:f45f1640…')
  })

  it('falls back to truncated UUID when profileMap is undefined', () => {
    const id = 'f45f1640-30fe-47d7-a286-a6b8e1dc1629'

    expect(summarizeInvokers([{ type: 'agent', agent_id: id }])).toBe('agent:f45f1640…')
  })

  it('returns agent_type label when agent_type is set', () => {
    expect(summarizeInvokers([{ type: 'agent', agent_type: 'kombuse' }])).toBe('type:kombuse')
  })

  it('agent_type takes precedence over agent_id when both are set', () => {
    const id = 'f45f1640-30fe-47d7-a286-a6b8e1dc1629'
    const profileMap = new Map<string, Profile>()
    profileMap.set(id, makeProfile(id, 'Kombuse'))

    const invokers: AllowedInvoker[] = [
      { type: 'agent', agent_id: id, agent_type: 'coder' },
    ]
    expect(summarizeInvokers(invokers, profileMap)).toBe('type:coder')
  })

  it('joins multiple rule labels with " | "', () => {
    const result = summarizeInvokers([
      { type: 'user' },
      { type: 'agent', agent_type: 'kombuse' },
      { type: 'system' },
    ])
    expect(result).toBe('Users | type:kombuse | System')
  })
})
