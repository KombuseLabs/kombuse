import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../types'
import { ClaudeCodeBackend } from '../backends/claude-code'
import { CodexBackend } from '../backends/codex'

function getCompleteEvents(events: AgentEvent[]): Extract<AgentEvent, { type: 'complete' }>[] {
  return events.filter(
    (event): event is Extract<AgentEvent, { type: 'complete' }> => event.type === 'complete'
  )
}

describe('backend stop lifecycle', () => {
  it('allows stopping Claude backend while startup is in progress', async () => {
    const backend = new ClaudeCodeBackend({ cliPath: 'claude' })
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    ;(backend as unknown as { starting: () => boolean }).starting()
    await backend.stop()

    const completeEvents = getCompleteEvents(events)
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0]).toMatchObject({
      reason: 'stopped',
      success: false,
      errorMessage: 'Stopped by user',
    })
    expect(backend.isRunning()).toBe(false)
  })

  it('allows stopping Codex backend while startup is in progress', async () => {
    const backend = new CodexBackend({ cliPath: 'codex' })
    const events: AgentEvent[] = []
    backend.subscribe((event) => events.push(event))

    ;(backend as unknown as { starting: () => boolean }).starting()
    await backend.stop()

    const completeEvents = getCompleteEvents(events)
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0]).toMatchObject({
      reason: 'stopped',
      success: false,
      errorMessage: 'Stopped by user',
    })
    expect(backend.isRunning()).toBe(false)
  })
})
