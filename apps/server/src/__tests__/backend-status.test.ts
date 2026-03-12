import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockResolveClaudePath = vi.fn()
const mockResolveCodexPath = vi.fn()
const mockBuildCleanPath = vi.fn((p?: string) => `/clean/path:${p || ''}`)
vi.mock('@kombuse/agent', () => ({
  resolveClaudePath: () => mockResolveClaudePath(),
  resolveCodexPath: () => mockResolveCodexPath(),
  buildCleanPath: (p?: string) => mockBuildCleanPath(p),
}))

const mockSpawnSync = vi.fn()
const mockExecFileSync = vi.fn()
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

const mockAccessSync = vi.fn()
vi.mock('node:fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 },
}))

vi.mock('@kombuse/services', () => ({
  readBinaryPath: () => null,
}))

import {
  checkAllBackendStatuses,
  refreshBackendStatuses,
  MIN_SUPPORTED_VERSIONS,
  MIN_NODE_VERSIONS,
} from '../services/backend-status'

beforeEach(() => {
  mockResolveClaudePath.mockReset()
  mockResolveCodexPath.mockReset()
  mockSpawnSync.mockReset()
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
  mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('not found') })
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
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.16\n', stderr: '', status: 0 }
      if (path === '/usr/local/bin/codex') return { stdout: 'codex 0.3.2\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1 }
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
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('timeout') })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.available).toBe(true)
    expect(claude?.version).toBeNull()
    expect(claude?.path).toBe('/usr/local/bin/claude')
  })

  it('reports unavailable when resolve returns bare name and --version fails', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('not found') })

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
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === 'claude') return { stdout: 'claude-code 1.0.16\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.available).toBe(true)
    expect(claude?.version).toBe('1.0.16')
    expect(claude?.path).toBeNull()
  })

  it('uses spawnSync with array args (no shell)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockReturnValue({ stdout: '1.0.0\n', stderr: '', status: 0 })

    refreshBackendStatuses()

    expect(mockSpawnSync).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['--version'],
      expect.objectContaining({ timeout: 5_000, encoding: 'utf-8' })
    )
  })

  it('passes env with clean PATH to spawnSync (getVersion)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockReturnValue({ stdout: '1.0.40\n', stderr: '', status: 0 })

    refreshBackendStatuses()

    expect(mockSpawnSync).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['--version'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: expect.stringContaining('/clean/path') }),
      })
    )
  })

  it('passes env with clean PATH to execFileSync (getNodeVersion)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockReturnValue({ stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 })
    mockExecFileSync.mockReturnValue('v22.5.0\n')

    refreshBackendStatuses()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'node',
      ['--version'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: expect.stringContaining('/clean/path') }),
      })
    )
  })

  it('caches results for subsequent calls', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('not found') })

    refreshBackendStatuses()
    checkAllBackendStatuses()

    // resolveClaudePath called only once due to cache
    expect(mockResolveClaudePath).toHaveBeenCalledTimes(1)
  })

  it('refreshBackendStatuses clears cache and re-checks', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('not found') })

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
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === npmGlobalPath) return { stdout: 'codex 0.3.2\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
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
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude')
        return { stdout: 'Claude Code v1.2.3-beta.1 (built 2025-01-01)', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.version).toBe('1.2.3-beta.1')
  })

  it('extracts version from stderr when stdout is empty', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('/usr/local/bin/codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return { stdout: '', stderr: 'codex 0.3.2\n', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const codex = statuses.find((s) => s.backendType === 'codex')

    expect(codex?.available).toBe(true)
    expect(codex?.version).toBe('0.3.2')
  })

  it('extracts version when process exits with non-zero code', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('/usr/local/bin/codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return { stdout: '', stderr: 'codex 0.3.2\n', status: 1 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const codex = statuses.find((s) => s.backendType === 'codex')

    expect(codex?.available).toBe(true)
    expect(codex?.version).toBe('0.3.2')
  })
})

describe('minimum version checking', () => {
  it('exports MIN_SUPPORTED_VERSIONS with expected entries', () => {
    expect(MIN_SUPPORTED_VERSIONS['claude-code']).toBe('1.0.40')
    expect(MIN_SUPPORTED_VERSIONS['codex']).toBe('0.100.0')
  })

  it('meetsMinimum is true when version meets the global minimum', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.meetsMinimum).toBe(true)
    expect(claude?.minimumVersion).toBe('1.0.40')
  })

  it('meetsMinimum is true when version exceeds the global minimum', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 2.0.0\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.meetsMinimum).toBe(true)
  })

  it('meetsMinimum is false when version is below the global minimum', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.16\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.meetsMinimum).toBe(false)
    expect(claude?.minimumVersion).toBe('1.0.40')
  })

  it('meetsMinimum is true when version is null (binary exists but --version fails)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('timeout') })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.available).toBe(true)
    expect(claude?.version).toBeNull()
    expect(claude?.meetsMinimum).toBe(true)
  })

  it('meetsMinimum is false when backend is unavailable', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockSpawnSync.mockReturnValue({ stdout: '', stderr: '', status: 1, error: new Error('not found') })

    const statuses = refreshBackendStatuses()

    for (const s of statuses) {
      expect(s.meetsMinimum).toBe(false)
    }
  })

  it('meetsMinimum is false for pre-release below minimum', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude')
        return { stdout: 'Claude Code v1.0.40-beta.1', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.version).toBe('1.0.40-beta.1')
    expect(claude?.meetsMinimum).toBe(false)
  })

  it('minimumVersion is included for each backend', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('/usr/local/bin/codex')
    mockAccessSync.mockImplementation(() => {})
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 }
      if (path === '/usr/local/bin/codex') return { stdout: 'codex 0.100.0\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1 }
    })

    const statuses = refreshBackendStatuses()

    const claude = statuses.find((s) => s.backendType === 'claude-code')
    expect(claude?.minimumVersion).toBe('1.0.40')

    const codex = statuses.find((s) => s.backendType === 'codex')
    expect(codex?.minimumVersion).toBe('0.100.0')
  })
})

describe('node version checking', () => {
  it('exports MIN_NODE_VERSIONS with claude-code entry', () => {
    expect(MIN_NODE_VERSIONS['claude-code']).toBe('20.0.0')
  })

  it('populates nodeVersion when node is available', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === 'node') return 'v22.5.0\n'
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.nodeVersion).toBe('22.5.0')
    expect(claude?.meetsNodeMinimum).toBe(true)
    expect(claude?.minimumNodeVersion).toBe('20.0.0')
  })

  it('meetsNodeMinimum is false when node < 20', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })
    mockExecFileSync.mockImplementation((path: string) => {
      if (path === 'node') return 'v18.19.0\n'
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.nodeVersion).toBe('18.19.0')
    expect(claude?.meetsNodeMinimum).toBe(false)
  })

  it('meetsNodeMinimum is true when node is not found (graceful)', () => {
    mockResolveClaudePath.mockReturnValue('/usr/local/bin/claude')
    mockResolveCodexPath.mockReturnValue('codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/claude') return { stdout: 'claude-code 1.0.40\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })

    const statuses = refreshBackendStatuses()
    const claude = statuses.find((s) => s.backendType === 'claude-code')

    expect(claude?.nodeVersion).toBeNull()
    expect(claude?.meetsNodeMinimum).toBe(true)
  })

  it('does not check node version for codex', () => {
    mockResolveClaudePath.mockReturnValue('claude')
    mockResolveCodexPath.mockReturnValue('/usr/local/bin/codex')
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return
      throw new Error('not found')
    })
    mockSpawnSync.mockImplementation((path: string) => {
      if (path === '/usr/local/bin/codex') return { stdout: 'codex 0.100.0\n', stderr: '', status: 0 }
      return { stdout: '', stderr: '', status: 1, error: new Error('not found') }
    })

    const statuses = refreshBackendStatuses()
    const codex = statuses.find((s) => s.backendType === 'codex')

    expect(codex?.nodeVersion).toBeNull()
    expect(codex?.meetsNodeMinimum).toBe(true)
    expect(codex?.minimumNodeVersion).toBeNull()
  })
})
