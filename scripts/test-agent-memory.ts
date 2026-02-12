#!/usr/bin/env bun
/**
 * Live integration test for multi-turn agent memory.
 * Verifies that a persistent Claude CLI backend retains context across turns
 * by keeping the process alive and sending follow-up messages via stdin.
 *
 * Usage: bun run scripts/test-agent-memory.ts
 *
 * Requires a valid Claude CLI installation with API credentials configured.
 */

import { ClaudeCodeBackend } from '../packages/agent/src/backends/claude-code/claude-code'
import type { AgentEvent, KombuseSessionId } from '@kombuse/types'

const TURN_TIMEOUT_MS = 120_000

async function waitForTurnComplete(backend: ClaudeCodeBackend): Promise<string> {
  return new Promise((resolve, reject) => {
    let lastAssistantMessage = ''
    const timer = setTimeout(() => {
      unsub()
      reject(new Error(`Turn timed out after ${TURN_TIMEOUT_MS}ms`))
    }, TURN_TIMEOUT_MS)

    const unsub = backend.subscribe((event: AgentEvent) => {
      if (event.type === 'message' && event.role === 'assistant' && event.content) {
        lastAssistantMessage = event.content
      }
      if (event.type === 'complete') {
        clearTimeout(timer)
        unsub()
        if (event.success === false) {
          reject(new Error(event.errorMessage ?? 'Turn failed'))
        } else {
          resolve(lastAssistantMessage)
        }
      }
    })
  })
}

async function main() {
  console.log('=== Agent Multi-Turn Memory Test ===\n')

  const backend = new ClaudeCodeBackend()

  try {
    // Turn 1: Ask an incomplete question
    console.log('Turn 1: Sending "What is the color of? If you don\'t understand respond with \'?\'"')

    const turn1Promise = waitForTurnComplete(backend)

    await backend.start({
      kombuseSessionId: 'test-memory' as KombuseSessionId,
      projectPath: process.cwd(),
      systemPrompt: 'Answer questions concisely in one sentence. Do not use tools.',
      initialMessage: 'What is the color of? If you don\'t understand the question respond with only "?"',
      maxTurns: 1,
    })

    const turn1Response = await turn1Promise
    console.log(`Turn 1 response: "${turn1Response}"\n`)

    // Verify process is still alive
    if (!backend.isRunning()) {
      console.error('FAIL: Backend process exited after turn 1 — expected it to stay alive')
      process.exit(1)
    }
    console.log('Process still running after turn 1 ✓\n')

    // Turn 2: Complete the question using the same process via send()
    console.log('Turn 2: Sending "sky"')

    const turn2Promise = waitForTurnComplete(backend)
    backend.send('sky')
    const turn2Response = await turn2Promise
    console.log(`Turn 2 response: "${turn2Response}"\n`)

    // Assert
    const containsBlue = turn2Response.toLowerCase().includes('blue')
    if (containsBlue) {
      console.log('PASS: Agent remembered context and answered "blue"')
      process.exit(0)
    } else {
      console.error(`FAIL: Expected response to contain "blue", got: "${turn2Response}"`)
      process.exit(1)
    }
  } catch (error) {
    console.error('FAIL:', error)
    process.exit(1)
  } finally {
    if (backend.isRunning()) {
      await backend.stop()
    }
  }
}

main()
