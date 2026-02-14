import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { SessionHeader, type SessionHeaderProps } from '../session-header'

if (!('ResizeObserver' in globalThis)) {
  const ResizeObserverStub = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}

const clipboardWriteText = vi.fn().mockResolvedValue(undefined)

function renderHeader(props: Partial<SessionHeaderProps> = {}) {
  return render(
    <SessionHeader
      eventCount={2}
      {...props}
    />
  )
}

describe('SessionHeader', () => {
  beforeEach(() => {
    clipboardWriteText.mockReset()
    clipboardWriteText.mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
  })

  it('shows backend details popover with resolved backend and applied model while preserving core header status', () => {
    const { getByRole, getByText } = renderHeader({
      isConnected: true,
      isLoading: true,
      eventCount: 3,
      sessionId: 'chat-00000000-0000-0000-0000-000000000001',
      backendSessionId: 'backend-00000000-0000-0000-0000-000000000001',
      effectiveBackend: 'codex',
      appliedModel: 'gpt-5-mini',
      modelPreference: 'gpt-5',
    })

    expect(getByText('Connected')).toBeDefined()
    expect(getByText('Running')).toBeDefined()
    expect(getByText('3 events')).toBeDefined()
    expect(getByText('chat-00000000')).toBeDefined()

    fireEvent.click(getByRole('button', { name: 'Backend details' }))

    expect(getByText('Backend')).toBeDefined()
    expect(getByText('codex')).toBeDefined()
    expect(getByText('Used model')).toBeDefined()
    expect(getByText('gpt-5-mini')).toBeDefined()
    expect(getByText('Model preference')).toBeDefined()
    expect(getByText('gpt-5')).toBeDefined()
  })

  it('shows backend-default fallback for used model when only model preference is available', () => {
    const { getByRole, getByText } = renderHeader({
      sessionId: 'chat-00000000-0000-0000-0000-000000000001',
      effectiveBackend: 'claude-code',
      appliedModel: null,
      modelPreference: 'gpt-5',
    })

    fireEvent.click(getByRole('button', { name: 'Backend details' }))

    expect(getByText('Backend default')).toBeDefined()
    expect(getByText('Preference set: gpt-5')).toBeDefined()
    expect(getByText('Model preference')).toBeDefined()
  })

  it('copies full kombuse and backend session IDs from popover copy actions', async () => {
    const sessionId = 'chat-12345678-1234-1234-1234-1234567890ab'
    const backendSessionId = 'backend-abcdef01-2345-6789-abcd-ef0123456789'
    const { getByRole } = renderHeader({
      sessionId,
      backendSessionId,
      effectiveBackend: 'codex',
    })

    fireEvent.click(getByRole('button', { name: 'Backend details' }))
    fireEvent.click(getByRole('button', { name: 'Copy Kombuse session ID' }))
    fireEvent.click(getByRole('button', { name: 'Copy backend session ID' }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenNthCalledWith(1, sessionId)
      expect(clipboardWriteText).toHaveBeenNthCalledWith(2, backendSessionId)
    })
  })
})
