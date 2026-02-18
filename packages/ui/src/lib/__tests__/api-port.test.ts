import { describe, it, expect, afterEach } from 'vitest'
import { getServerPort, getWsUrl } from '../api'

describe('getServerPort', () => {
  const originalElectron = window.electron

  afterEach(() => {
    if (originalElectron === undefined) {
      delete (window as unknown as Record<string, unknown>).electron
    } else {
      window.electron = originalElectron
    }
  })

  it('returns the Electron server port when available', () => {
    window.electron = { serverPort: 4567 }
    expect(getServerPort()).toBe(4567)
  })

  it('returns 3331 when window.electron is undefined', () => {
    delete (window as unknown as Record<string, unknown>).electron
    expect(getServerPort()).toBe(3331)
  })

  it('returns 3331 when window.electron exists but serverPort is undefined', () => {
    window.electron = {}
    expect(getServerPort()).toBe(3331)
  })
})

describe('getWsUrl', () => {
  const originalElectron = window.electron

  afterEach(() => {
    if (originalElectron === undefined) {
      delete (window as unknown as Record<string, unknown>).electron
    } else {
      window.electron = originalElectron
    }
  })

  it('constructs WebSocket URL from dynamic port', () => {
    window.electron = { serverPort: 9999 }
    expect(getWsUrl()).toBe('ws://localhost:9999/ws')
  })

  it('uses default port when no Electron context', () => {
    delete (window as unknown as Record<string, unknown>).electron
    expect(getWsUrl()).toBe('ws://localhost:3331/ws')
  })
})
