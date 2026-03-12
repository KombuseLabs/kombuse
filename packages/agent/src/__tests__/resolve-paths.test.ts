import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAccessSync = vi.fn()
vi.mock('node:fs', () => ({
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 },
}))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    accessSync: (...args: unknown[]) => mockAccessSync(...args),
    constants: { X_OK: 1 },
  }
})

const mockExecSync = vi.fn()
const mockExecFileSync = vi.fn()
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

import { resolveCodexPath } from '../backends/codex/utils'
import { resolveClaudePath } from '../backends/claude-code/utils'

beforeEach(() => {
  mockAccessSync.mockReset()
  mockExecSync.mockReset()
  mockExecFileSync.mockReset()
  delete process.env.CODEX_PATH
  delete process.env.CLAUDE_PATH
})

describe('resolveCodexPath — npm prefix detection', () => {
  it('finds codex via npm config get prefix when hardcoded paths miss', () => {
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/custom/npm/prefix/bin/codex') return
      throw new Error('not found')
    })
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm config')) return '/custom/npm/prefix\n'
      throw new Error('not found')
    })

    expect(resolveCodexPath()).toBe('/custom/npm/prefix/bin/codex')
  })

  it('prefers hardcoded paths over npm prefix', () => {
    mockAccessSync.mockImplementation(() => {})
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm config')) return '/custom/npm/prefix\n'
      throw new Error('not found')
    })

    const result = resolveCodexPath()
    // Should return first hardcoded path, not the npm prefix one
    expect(result).not.toBe('/custom/npm/prefix/bin/codex')
  })

  it('falls back to bare name when npm config get prefix fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
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

describe('resolveCodexPath — login-shell fallback', () => {
  it('finds codex via login shell when hardcoded paths and npm prefix miss', () => {
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/Users/user/.nvm/versions/node/v20/bin/codex') return
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })
    mockExecFileSync.mockImplementation((_shell: string, args: string[]) => {
      if (args.some((a: string) => a.includes('command -v'))) return '/Users/user/.nvm/versions/node/v20/bin/codex\n'
      throw new Error('not available')
    })

    expect(resolveCodexPath()).toBe('/Users/user/.nvm/versions/node/v20/bin/codex')
  })

  it('prefers hardcoded paths over login-shell result', () => {
    mockAccessSync.mockImplementation(() => {})
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })
    mockExecFileSync.mockImplementation((_shell: string, args: string[]) => {
      if (args.some((a: string) => a.includes('command -v'))) return '/Users/user/.nvm/versions/node/v20/bin/codex\n'
      throw new Error('not available')
    })

    const result = resolveCodexPath()
    expect(result).not.toBe('/Users/user/.nvm/versions/node/v20/bin/codex')
  })

  it('falls back to bare name when login shell also fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not available')
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
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm config')) return '/home/user/.nvm/versions/node/v20\n'
      throw new Error('not found')
    })

    expect(resolveClaudePath()).toBe(
      '/home/user/.nvm/versions/node/v20/bin/claude'
    )
  })

  it('prefers hardcoded paths over npm prefix', () => {
    mockAccessSync.mockImplementation(() => {})
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npm config')) return '/custom/prefix\n'
      throw new Error('not found')
    })

    const result = resolveClaudePath()
    expect(result).not.toBe('/custom/prefix/bin/claude')
  })

  it('falls back to bare name when npm config get prefix fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })

    expect(resolveClaudePath()).toBe('claude')
  })
})

describe('resolveClaudePath — login-shell fallback', () => {
  it('finds claude via login shell when hardcoded paths and npm prefix miss', () => {
    mockAccessSync.mockImplementation((path: string) => {
      if (path === '/Users/user/.nvm/versions/node/v20/bin/claude') return
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })
    mockExecFileSync.mockImplementation((_shell: string, args: string[]) => {
      if (args.some((a: string) => a.includes('command -v'))) return '/Users/user/.nvm/versions/node/v20/bin/claude\n'
      throw new Error('not available')
    })

    expect(resolveClaudePath()).toBe('/Users/user/.nvm/versions/node/v20/bin/claude')
  })

  it('falls back to bare name when login shell also fails', () => {
    mockAccessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    mockExecSync.mockImplementation(() => {
      throw new Error('not available')
    })
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not available')
    })

    expect(resolveClaudePath()).toBe('claude')
  })
})
