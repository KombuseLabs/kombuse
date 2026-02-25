import { describe, it, expect } from 'vitest'
import {
  createSessionLogger,
  createAppLogger,
  pruneOldLogs,
  closeAppLogger,
} from '../logger'

describe('logger re-exports', () => {
  it('re-exports createSessionLogger', () => {
    expect(typeof createSessionLogger).toBe('function')
  })

  it('re-exports createAppLogger', () => {
    expect(typeof createAppLogger).toBe('function')
  })

  it('re-exports pruneOldLogs', () => {
    expect(typeof pruneOldLogs).toBe('function')
  })

  it('re-exports closeAppLogger', () => {
    expect(typeof closeAppLogger).toBe('function')
  })
})
