import { describe, expect, it } from 'vitest'
import { CodexBackend } from '../codex'

function callFormatExitError(backend: CodexBackend, code: number | null): string {
  return (backend as any).formatExitError(code)
}

function setStderrBuffer(backend: CodexBackend, lines: string[]): void {
  ;(backend as any).stderrBuffer = lines
}

describe('CodexBackend.formatExitError', () => {
  it('returns base message when stderr buffer is empty', () => {
    const backend = new CodexBackend()
    const result = callFormatExitError(backend, 1)
    expect(result).toBe('Codex process exited with code 1')
  })

  it('includes stderr content when buffer is non-empty', () => {
    const backend = new CodexBackend()
    setStderrBuffer(backend, ['some error output\n'])
    const result = callFormatExitError(backend, 1)
    expect(result).toBe('Codex process exited with code 1\nsome error output')
  })

  it('truncates stderr to last 500 chars', () => {
    const backend = new CodexBackend()
    const longStderr = 'x'.repeat(600)
    setStderrBuffer(backend, [longStderr])
    const result = callFormatExitError(backend, 1)
    expect(result).toBe(`Codex process exited with code 1\n${'x'.repeat(500)}`)
  })

  it('adds binary-not-found guidance for code 127', () => {
    const backend = new CodexBackend()
    const result = callFormatExitError(backend, 127)
    expect(result).toContain('Codex process exited with code 127')
    expect(result).toContain('The codex binary was not found')
    expect(result).toContain('Settings > Binaries')
  })

  it('includes both stderr and hint for code 127', () => {
    const backend = new CodexBackend()
    setStderrBuffer(backend, ['codex: command not found\n'])
    const result = callFormatExitError(backend, 127)
    expect(result).toContain('codex: command not found')
    expect(result).toContain('The codex binary was not found')
  })

  it('handles null exit code', () => {
    const backend = new CodexBackend()
    const result = callFormatExitError(backend, null)
    expect(result).toBe('Codex process exited with code null')
  })
})
