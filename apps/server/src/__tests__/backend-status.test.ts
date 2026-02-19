import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockResolveClaudePath = vi.fn()
const mockResolveCodexPath = vi.fn()
vi.mock('@kombuse/agent', () => ({
  resolveClaudePath: () => mockResolveClaudePath(),
  resolveCodexPath: () => mockResolveCodexPath(),
}))

const mockExecFileSync = vi.fn()
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

const mockAccessSync = vi.fn()
vi.mock('node:fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 },
}))

import {
  checkAllBackendStatuses,
  refreshBackendStatuses,
} from '../services/backend-status'

beforeEach(() => {
  mockResolveClaudePath.mockReset()
  mockResolveCodexPath.mockReset()
  mockExecFileSync.mockReset()
  mockAccessSync.mockReset()
})

afterEach(() => {
  // Clear the internal cache between tests
  mockResolveClaudePath.mockReturnValue('claude')
  mockResolveCodexPath.mockReturnValue('codex')
  mockAccessSync.mockImplementation(() => {
    throw new Error('not found')
  })
  mockExecFileSync.mockImplementation(() => {
    throw new Error('not found')
  })
  refreshBackendStatuses()
})

describe('checkAllBackendStatuses', () => {
  it('reports both backends available when binaries exist with versions', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('/usr/local/bin/codex')
    mockAccessSync.mockImplementation(() => {})
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return 'claude-code 1.0.16\n'
      if (path === '/usr/local/bin/codex') return 'codex 0.3.2\n'
      return ''
    })

    const statuses = refreshBackendStatuses()

    expect(statuses).toHaveLength(2)

    const claude = statuses.find((s) => s.backendType === 'claude-code')
    expect(claude?.available).toBe(true)
    expect(claude?.version).toBe('1.0.16')
    expect(claude?.path).toBe('/usr/local/bin/claude')

    const codex = statuses.find((s) => s.backendType === 'codex')
    expect(codex?.available).toBe(true)
    expect(codex?.version).toBe('0.3.2')
    expect(codex?.path).toBe('/usr/local/bin/codex')
  })

  it('reports available with null version when binary exists but --version fails', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockExecFileSync.mockImplementation(() => {
      throw new Error('timeout')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.available).toBe(true)
    expect(claude?.version).toBeNull()
    expect(claude?.path).toBe('/usr/local/bin/claude')
  })

  it('reports unavailable when resolve returns bare name and --version fails', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()

    for (const s of statuses) {
      expect(s.available).toBe(false)
      expect(s.version).toBeNull()
      expect(s.path).toBeNull()
    }
  })

  it('reports available when bare name succeeds with --version via PATH', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === 'claude') return 'claude-code 1.0.16\n'
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.available).toBe(true)
    expect(claude?.version).toBe('1.0.16')
    expect(claude?.path).toBeNull()
  })

  it('uses execFileSync with array args (no shell)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockExecFileSync.mockReturnValue('1.0.0\n')

    refreshBackendStatuses()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['--version'],
      expect.objectContaining({ timeout: 5_000, encoding: 'utf-8' })
    )
  })

  it('caches results for subsequent calls', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })

    refreshBackendStatuses()
    checkAllBackendStatuses()

    // resolveClaudePath called only once due to cache
    expect(mockResolveClaudePath).toHaveBeenCalledTimes(1)
  })

  it('refreshBackendStatuses clears cache and re-checks', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })

    refreshBackendStatuses()
    refreshBackendStatuses()

    expect(mockResolveClaudePath).toHaveBeenCalledTimes(2)
  })

  it('reports codex available when resolved via npm-global path', () => {
    const npmGlobalPath = '/Users/test/.npm-global/bin/codex'
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue(npmGlobalPath)
    mockAccessSync.mockImplementation((path: string) => {
      if (path === npmGlobalPath) return
      throw new Error('not found')
    })
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === npmGlobalPath) return 'codex 0.3.2\n'
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const codex = statuses.find((s) => s.backendType === 'codex')

    expect(codex?.available).toBe(true)
    expect(codex?.version).toBe('0.3.2')
    expect(codex?.path).toBe(npmGlobalPath)
  })

  it('parses semver from version output with extra text', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude')
        return 'Claude Code v1.2.3-beta.1 (built 2025-01-01)'
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.version).toBe('1.2.3-beta.1')
  })
})
