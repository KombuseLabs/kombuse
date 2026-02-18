import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}))

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { ClaudeCodeScanner } from '../claude-code-scanner-service'

const mockedExistsSync = vi.mocked(existsSync)
const mockedReaddirSync = vi.mocked(readdirSync)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedStatSync = vi.mocked(statSync)

function makeSessionsIndex(originalPath: string, entries: unknown[] = []) {
  return JSON.stringify({ version: 1, originalPath, entries })
}

describe('ClaudeCodeScanner', () => {
  let scanner: ClaudeCodeScanner

  beforeEach(() => {
    vi.clearAllMocks()
    scanner = new ClaudeCodeScanner()
  })

  describe('scan()', () => {
    it('returns empty array when projects directory does not exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(scanner.scan()).toEqual([])
    })

    it('discovers projects from valid sessions-index.json', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReaddirSync.mockReturnValue(['-Users-me-project1'] as unknown as ReturnType<typeof readdirSync>)
      mockedStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      mockedReadFileSync.mockReturnValue(
        makeSessionsIndex('/Users/me/project1', [
          {
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            messageCount: 5,
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-02T00:00:00Z',
            gitBranch: 'main',
            projectPath: '/Users/me/project1',
          },
        ])
      )

      const results = scanner.scan()
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('project1')
      expect(results[0]!.path).toBe('/Users/me/project1')
      expect(results[0]!.totalSessions).toBe(1)
      expect(results[0]!.totalMessages).toBe(5)
      expect(results[0]!.gitBranch).toBe('main')
    })

    it('skips directories with corrupted JSON', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReaddirSync.mockReturnValue(['-Users-me-project1'] as unknown as ReturnType<typeof readdirSync>)
      mockedStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      mockedReadFileSync.mockReturnValue('not valid json{{{')

      const results = scanner.scan()
      expect(results).toEqual([])
    })

    it('skips entries with missing originalPath', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReaddirSync.mockReturnValue(['dir1'] as unknown as ReturnType<typeof readdirSync>)
      mockedStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ version: 1, entries: [{ sessionId: 'a', modified: '2026-01-01T00:00:00Z' }] })
      )

      const results = scanner.scan()
      expect(results).toEqual([])
    })

    it('skips entries with empty entries array', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReaddirSync.mockReturnValue(['dir1'] as unknown as ReturnType<typeof readdirSync>)
      mockedStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      mockedReadFileSync.mockReturnValue(
        makeSessionsIndex('/Users/me/project1', [])
      )

      const results = scanner.scan()
      expect(results).toEqual([])
    })
  })

  describe('listSessions()', () => {
    it('returns sorted sessions', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(
        makeSessionsIndex('/Users/me/project1', [
          { sessionId: 'a', modified: '2026-01-01T00:00:00Z', messageCount: 1, gitBranch: 'main' },
          { sessionId: 'b', modified: '2026-01-03T00:00:00Z', messageCount: 2, gitBranch: 'dev' },
          { sessionId: 'c', modified: '2026-01-02T00:00:00Z', messageCount: 3, gitBranch: 'main' },
        ])
      )

      const sessions = scanner.listSessions('/Users/me/project1')
      expect(sessions).toHaveLength(3)
      expect(sessions[0]!.sessionId).toBe('b')
      expect(sessions[1]!.sessionId).toBe('c')
      expect(sessions[2]!.sessionId).toBe('a')
    })

    it('returns empty array when index file is missing', () => {
      mockedExistsSync.mockReturnValue(false)
      const sessions = scanner.listSessions('/Users/me/project1')
      expect(sessions).toEqual([])
    })

    it('rejects paths that resolve outside ~/.claude/projects/', () => {
      expect(() => scanner.listSessions('')).toThrow('Invalid project path')
    })
  })

  describe('getSessionContent()', () => {
    it('returns parsed JSONL items', () => {
      mockedExistsSync.mockReturnValue(true)
      const jsonl = [
        JSON.stringify({ type: 'human', message: 'hello' }),
        JSON.stringify({ type: 'assistant', message: 'hi' }),
      ].join('\n')
      mockedReadFileSync.mockReturnValue(jsonl)

      const items = scanner.getSessionContent(
        '/Users/me/project1',
        '550e8400-e29b-41d4-a716-446655440000'
      )
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual({ type: 'human', message: 'hello' })
    })

    it('rejects non-UUID sessionId', () => {
      expect(() =>
        scanner.getSessionContent('/Users/me/project1', '../../etc/passwd')
      ).toThrow('Invalid session ID format')
    })

    it('rejects sessionId with path traversal characters', () => {
      expect(() =>
        scanner.getSessionContent('/Users/me/project1', '../../../etc/shadow')
      ).toThrow('Invalid session ID format')
    })

    it('throws when session file is not found', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(() =>
        scanner.getSessionContent(
          '/Users/me/project1',
          '550e8400-e29b-41d4-a716-446655440000'
        )
      ).toThrow('Session file not found')
    })

    it('rejects paths that resolve outside ~/.claude/projects/', () => {
      expect(() =>
        scanner.getSessionContent('', '550e8400-e29b-41d4-a716-446655440000')
      ).toThrow('Invalid project path')
    })
  })
})
