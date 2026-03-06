import { describe, it, expect } from 'vitest'
import type { UpdateStatus } from '@kombuse/types'
import { computeEffectiveStatus } from '../update-utils'

const makeStatus = (overrides: Partial<UpdateStatus> = {}): UpdateStatus => ({
  state: 'available',
  currentVersion: '1.0.0',
  updateInfo: {
    version: '1.1.0',
    downloadUrl: 'https://example.com/download',
    releaseNotes: null,
    publishedAt: '2026-01-01T00:00:00Z',
  },
  downloadProgress: 0,
  error: null,
  ...overrides,
})

describe('computeEffectiveStatus', () => {
  it('returns null when status is null', () => {
    expect(computeEffectiveStatus(null, null)).toBeNull()
    expect(computeEffectiveStatus(null, '1.0.0')).toBeNull()
  })

  it('passes through status when no dismissed version', () => {
    const status = makeStatus()
    expect(computeEffectiveStatus(status, null)).toBe(status)
  })

  it('passes through status when dismissed version does not match', () => {
    const status = makeStatus()
    expect(computeEffectiveStatus(status, '2.0.0')).toBe(status)
  })

  it('returns idle status with preserved currentVersion when dismissed version matches', () => {
    const status = makeStatus({ currentVersion: '1.0.0' })
    const result = computeEffectiveStatus(status, '1.1.0')

    expect(result).not.toBeNull()
    expect(result!.state).toBe('idle')
    expect(result!.currentVersion).toBe('1.0.0')
    expect(result!.updateInfo).toBeNull()
  })

  it('passes through non-available states even if dismissed version is set', () => {
    const idle = makeStatus({ state: 'idle', updateInfo: null })
    expect(computeEffectiveStatus(idle, '1.1.0')).toBe(idle)

    const downloading = makeStatus({ state: 'downloading', downloadProgress: 50 })
    expect(computeEffectiveStatus(downloading, '1.1.0')).toBe(downloading)

    const ready = makeStatus({ state: 'ready' })
    expect(computeEffectiveStatus(ready, '1.1.0')).toBe(ready)

    const error = makeStatus({ state: 'error', error: 'fail' })
    expect(computeEffectiveStatus(error, '1.1.0')).toBe(error)
  })

  it('preserves other status fields in the returned idle status', () => {
    const status = makeStatus({ downloadProgress: 42, error: 'previous error' })
    const result = computeEffectiveStatus(status, '1.1.0')

    expect(result).not.toBeNull()
    expect(result!.downloadProgress).toBe(42)
    expect(result!.error).toBe('previous error')
  })
})
