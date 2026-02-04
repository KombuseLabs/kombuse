import { describe, it, expectTypeOf } from 'vitest'
import type { AgentBackend, BackendType } from '../types'

describe('Agent Types', () => {
  it('keeps AgentBackend.name constrained to BackendType', () => {
    expectTypeOf<AgentBackend['name']>().toEqualTypeOf<BackendType>()
  })
})
