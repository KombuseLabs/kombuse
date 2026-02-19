import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAccessSync = vi.fn()
vi.mock('node:fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 },
}))
vi.mock('fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 },
}))

const mockExecSync = vi.fn()
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

import { resolveCodexPath } from '../backends/codex/utils'
import { resolveClaudePath } from '../backends/claude-code/utils'

beforeEach(() => {
  mockAccessSync.mockReset()
  mockExecSync.mockReset()
  delete process.env.CODEX_PATH
  delete process.env.CLAUDE_PATH
})

describe('resolveCodexPath — npm prefix detection', () => {
  it('finds codex via npm config get prefix when hardcoded paths miss', () => {
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/custom/npm/prefix/bin/codex') return
      throw new Error('not found')
    })
    mockExecSync.mockReturnValue('/custom/npm/prefix\n')

    expect(resolveCodexPath()).toBe('/custom/npm/prefix/bin/codex')
  })

  it('prefers hardcoded paths over npm prefix', () => {
    mockAccessSync.mockImplementation(() => {})
    mockExecSync.mockReturnValue('/custom/npm/prefix\n')

    const result = resolveCodexPath()
    // Should return first hardcoded path, not the npm prefix one
    expect(result).not.toBe('/custom/npm/prefix/bin/codex')
  })

  it('falls back to bare name when npm config get prefix fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('npm not available')
    })

    expect(resolveCodexPath()).toBe('codex')
  })

  it('falls back to bare name when npm config get prefix times out', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('ETIMEDOUT')
    })

    expect(resolveCodexPath()).toBe('codex')
  })
})

describe('resolveClaudePath — npm prefix detection', () => {
  it('finds claude via npm config get prefix when hardcoded paths miss', () => {
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/home/user/.nvm/versions/node/v20/bin/claude') return
      throw new Error('not found')
    })
    mockExecSync.mockReturnValue('/home/user/.nvm/versions/node/v20\n')

    expect(resolveClaudePath()).toBe(
      '/home/user/.nvm/versions/node/v20/bin/claude'
    )
  })

  it('prefers hardcoded paths over npm prefix', () => {
    mockAccessSync.mockImplementation(() => {})
    mockExecSync.mockReturnValue('/custom/prefix\n')

    const result = resolveClaudePath()
    expect(result).not.toBe('/custom/prefix/bin/claude')
  })

  it('falls back to bare name when npm config get prefix fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('npm not available')
    })

    expect(resolveClaudePath()).toBe('claude')
  })
})
