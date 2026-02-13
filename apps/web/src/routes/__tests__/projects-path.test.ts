import { describe, expect, it } from 'vitest'

import { deriveProjectNameFromPath } from '../projects-path'

describe('deriveProjectNameFromPath', () => {
  it('returns the last directory segment for POSIX paths', () => {
    expect(deriveProjectNameFromPath('/Users/alice/workspace/my-project')).toBe('my-project')
  })

  it('strips trailing path separators', () => {
    expect(deriveProjectNameFromPath('/Users/alice/workspace/my-project/')).toBe('my-project')
    expect(deriveProjectNameFromPath('C:\\\\Users\\\\alice\\\\my-project\\\\')).toBe('my-project')
  })

  it('handles Windows paths', () => {
    expect(deriveProjectNameFromPath('C:\\\\Users\\\\alice\\\\workspace\\\\my-project')).toBe('my-project')
  })

  it('returns empty string for blank input and root-only paths', () => {
    expect(deriveProjectNameFromPath('')).toBe('')
    expect(deriveProjectNameFromPath('   ')).toBe('')
    expect(deriveProjectNameFromPath('/')).toBe('')
    expect(deriveProjectNameFromPath('\\\\')).toBe('')
  })
})
