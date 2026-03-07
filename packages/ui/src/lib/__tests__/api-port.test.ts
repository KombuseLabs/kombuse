import { describe, it, expect, afterEach } from 'vitest'
import { getServerPort, getWsUrl } from '../api'

describe('getServerPort', () => {
  const originalElectron = window.electron
  const originalHref = window.location.href

  afterEach(() => {
    if (originalElectron === undefined) {
      delete (window as unknown as Record<string, unknown>).electron
    } else {
      window.electron = originalElectron
    }
    // Reset location back to original
    Object.defineProperty(window, 'location', {
      value: new URL(originalHref),
      writable: true,
      configurable: true,
    })
  })

  function setLocationHref(href: string) {
    Object.defineProperty(window, 'location', {
      value: new URL(href),
      writable: true,
      configurable: true,
    })
  }

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

  it('falls back to URL ?port= param when electron bridge is missing', () => {
    delete (window as unknown as Record<string, unknown>).electron
    setLocationHref('http://localhost:3333/?port=5678')
    expect(getServerPort()).toBe(5678)
  })

  it('falls back to URL ?port= param when serverPort is 0 (preload failure)', () => {
    window.electron = { serverPort: 0 }
    setLocationHref('http://localhost:3333/?port=5678')
    expect(getServerPort()).toBe(5678)
  })

  it('prefers electron bridge port over URL param', () => {
    window.electron = { serverPort: 4567 }
    setLocationHref('http://localhost:3333/?port=9999')
    expect(getServerPort()).toBe(4567)
  })

  it('returns 3331 when URL port param is invalid', () => {
    delete (window as unknown as Record<string, unknown>).electron
    setLocationHref('http://localhost:3333/?port=abc')
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
