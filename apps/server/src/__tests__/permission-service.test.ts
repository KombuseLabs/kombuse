import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLog } = vi.hoisted(() => ({
  mockLog: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@kombuse/core/logger', () => ({
  createAppLogger: vi.fn(() => mockLog),
}))

vi.mock('@kombuse/persistence', () => ({
  agentsRepository: { get: vi.fn(), update: vi.fn() },
}))

vi.mock('@kombuse/services', () => ({
  sessionPersistenceService: {
    getSessionByKombuseId: vi.fn(),
    persistEvent: vi.fn(),
  },
  appendToProjectPermissions: vi.fn(),
  stripCdPrefix: (command: string) => {
    let result = command.trim()
    while (true) {
      const match = result.match(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/)
      if (!match) break
      result = result.slice(match[0].length)
    }
    return result
  },
}))

vi.mock('../websocket/hub', () => ({
  wsHub: { broadcastToTopic: vi.fn() },
}))

import { agentsRepository } from '@kombuse/persistence'
import { persistAlwaysAllow } from '../services/agent-execution-service/permission-service'

function makeAgent(config: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    slug: null,
    system_prompt: 'test',
    permissions: [],
    config,
    is_enabled: true,
    plugin_id: null,
    project_id: null,
    plugin_base: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as ReturnType<typeof agentsRepository.get>
}

describe('persistAlwaysAllow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts Bash command prefix and persists to auto_approved_bash_commands_override', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(makeAgent({}))

    persistAlwaysAllow('agent-1', 'Bash', { command: 'wc -l file.txt' })

    expect(agentsRepository.update).toHaveBeenCalledWith('agent-1', {
      config: { auto_approved_bash_commands_override: ['wc'] },
    })
  })

  it('appends new Bash prefix to existing auto_approved_bash_commands_override', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(
      makeAgent({ auto_approved_bash_commands_override: ['git'] })
    )

    persistAlwaysAllow('agent-1', 'Bash', { command: 'npm install' })

    expect(agentsRepository.update).toHaveBeenCalledWith('agent-1', {
      config: { auto_approved_bash_commands_override: ['git', 'npm'] },
    })
  })

  it('returns early without updating when Bash command is empty whitespace', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(makeAgent({}))

    persistAlwaysAllow('agent-1', 'Bash', { command: '   ' })

    expect(agentsRepository.update).not.toHaveBeenCalled()
  })

  it('persists non-Bash tool name to auto_approved_tools_override', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(makeAgent({}))

    persistAlwaysAllow('agent-1', 'Write', { file_path: '/tmp/test.txt' })

    expect(agentsRepository.update).toHaveBeenCalledWith('agent-1', {
      config: { auto_approved_tools_override: ['Write'] },
    })
  })

  it('appends new tool to existing auto_approved_tools_override', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(
      makeAgent({ auto_approved_tools_override: ['Edit'] })
    )

    persistAlwaysAllow('agent-1', 'Write', {})

    expect(agentsRepository.update).toHaveBeenCalledWith('agent-1', {
      config: { auto_approved_tools_override: ['Edit', 'Write'] },
    })
  })

  it('does not update when Bash prefix is already in the list', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(
      makeAgent({ auto_approved_bash_commands_override: ['wc'] })
    )

    persistAlwaysAllow('agent-1', 'Bash', { command: 'wc -l file.txt' })

    expect(agentsRepository.update).not.toHaveBeenCalled()
  })

  it('does not update when tool name is already in the list', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(
      makeAgent({ auto_approved_tools_override: ['Write'] })
    )

    persistAlwaysAllow('agent-1', 'Write', {})

    expect(agentsRepository.update).not.toHaveBeenCalled()
  })

  it('logs a warning and returns early when agent is not found', () => {
    vi.mocked(agentsRepository.get).mockReturnValue(null)

    persistAlwaysAllow('non-existent', 'Bash', { command: 'ls' })

    expect(agentsRepository.update).not.toHaveBeenCalled()
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-existent')
    )
  })
})
