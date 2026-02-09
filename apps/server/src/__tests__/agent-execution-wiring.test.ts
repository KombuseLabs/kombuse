import { describe, it, expect, vi } from 'vitest'
import type { AgentBackend, AgentEvent, KombuseSessionId, StartOptions } from '@kombuse/types'

// Mock side-effect imports before importing the module under test
vi.mock('../websocket/hub', () => ({
  wsHub: {
    broadcastToTopic: vi.fn(),
    broadcastAgentMessage: vi.fn(),
  },
}))

vi.mock('../websocket/serialize-agent-event', () => ({
  serializeAgentStreamEvent: vi.fn(),
}))

vi.mock('../logger', () => ({
  createSessionLogger: vi.fn(() => ({
    logEvent: vi.fn(),
    info: vi.fn(),
    close: vi.fn(),
  })),
}))

import {
  startAgentChatSession,
  presetToAllowedTools,
  getTypePreset,
} from '../services/agent-execution-service'

describe('startAgentChatSession allowedTools wiring', () => {
  it('passes preset allowedTools through to backend.start()', async () => {
    let capturedOptions: StartOptions | undefined

    const mockBackend: AgentBackend = {
      name: 'claude-code' as const,
      start: vi.fn(async (options: StartOptions) => {
        capturedOptions = options
      }),
      stop: vi.fn(async () => {}),
      send: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      isRunning: vi.fn(() => true),
      getBackendSessionId: vi.fn(() => undefined),
    }

    const mockDependencies = {
      getAgent: vi.fn(() => ({
        id: 'test-agent',
        name: 'Test Agent',
        system_prompt: '',
        is_enabled: true,
        config: { type: 'kombuse' },
        permissions: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      processEvent: vi.fn(() => []),
      createBackend: vi.fn(() => mockBackend),
      generateSessionId: vi.fn(() => 'chat-test-id' as KombuseSessionId),
      resolveProjectPath: vi.fn(() => '/tmp'),
      sessionPersistence: {
        ensureSession: vi.fn(() => 'session-1'),
        getSession: vi.fn(() => null),
        markSessionRunning: vi.fn(),
        persistEvent: vi.fn(),
        completeSession: vi.fn(),
        failSession: vi.fn(),
        getSessionByKombuseId: vi.fn(() => null),
        getSessionEvents: vi.fn(() => []),
      },
    }

    startAgentChatSession(
      {
        type: 'agent.invoke' as const,
        agentId: 'test-agent',
        message: 'hello',
        kombuseSessionId: 'chat-test-id' as KombuseSessionId,
      },
      () => {},
      mockDependencies as any,
    )

    // Wait for the async backend.start() call to resolve
    await vi.waitFor(() => {
      expect(mockBackend.start).toHaveBeenCalled()
    })

    const expectedTools = presetToAllowedTools(getTypePreset('kombuse'))
    expect(capturedOptions?.allowedTools, 'allowedTools should be wired from preset to backend.start()').toEqual(expectedTools)
  })
})
