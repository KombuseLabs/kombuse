import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@kombuse/persistence', () => ({
  pluginFilesRepository: {
    get: vi.fn(() => null),
  },
}))

import { pluginFilesRepository } from '@kombuse/persistence'
import { getTypePreset, getEffectivePreset } from '../agent-type-preset-service'

const mockGet = pluginFilesRepository.get as ReturnType<typeof vi.fn>

describe('getEffectivePreset', () => {
  it('returns base preset when config is undefined', () => {
    const preset = getEffectivePreset('kombuse', undefined)
    const base = getTypePreset('kombuse')
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })

  it('returns base preset when config has no overrides', () => {
    const preset = getEffectivePreset('kombuse', { model: 'test' })
    const base = getTypePreset('kombuse')
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })

  it('merges override tools with base preset (additive)', () => {
    const base = getTypePreset('kombuse')
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Write', 'Edit'],
    })
    // Should include all base tools plus the overrides
    expect(preset.autoApprovedTools).toContain('Write')
    expect(preset.autoApprovedTools).toContain('Edit')
    for (const tool of base.autoApprovedTools) {
      expect(preset.autoApprovedTools).toContain(tool)
    }
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })

  it('merges override bash commands with base preset (additive)', () => {
    const base = getTypePreset('coder')
    const preset = getEffectivePreset('coder', {
      auto_approved_bash_commands_override: ['wc'],
    })
    // Should include all base bash commands plus the override
    expect(preset.autoApprovedBashCommands).toContain('wc')
    for (const cmd of base.autoApprovedBashCommands) {
      expect(preset.autoApprovedBashCommands).toContain(cmd)
    }
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
  })

  it('deduplicates when override contains tools already in base', () => {
    const base = getTypePreset('kombuse')
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Read', 'Grep'], // already in base
    })
    // Should not have duplicates
    const readCount = preset.autoApprovedTools.filter(t => t === 'Read').length
    expect(readCount).toBe(1)
    expect(preset.autoApprovedTools.length).toBe(base.autoApprovedTools.length)
  })

  it('empty override array adds nothing (preserves base)', () => {
    const base = getTypePreset('kombuse')
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: [],
    })
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
  })

  it('empty bash override array adds nothing (preserves base)', () => {
    const base = getTypePreset('coder')
    const preset = getEffectivePreset('coder', {
      auto_approved_bash_commands_override: [],
    })
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })

  it('preserves permissionMode from base', () => {
    const base = getTypePreset('coder')
    const preset = getEffectivePreset('coder', {
      auto_approved_tools_override: ['Read'],
    })
    expect(preset.permissionMode).toBe(base.permissionMode)
  })

  it('merges both tools and bash commands simultaneously', () => {
    const base = getTypePreset('kombuse')
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Write'],
      auto_approved_bash_commands_override: ['ls'],
    })
    expect(preset.autoApprovedTools).toContain('Write')
    for (const tool of base.autoApprovedTools) {
      expect(preset.autoApprovedTools).toContain(tool)
    }
    expect(preset.autoApprovedBashCommands).toContain('ls')
    for (const cmd of base.autoApprovedBashCommands) {
      expect(preset.autoApprovedBashCommands).toContain(cmd)
    }
  })

  it('falls back to default preset for unknown agent type', () => {
    const base = getTypePreset(undefined) // default
    const preset = getEffectivePreset('unknown-type', {
      auto_approved_tools_override: ['Write'],
    })
    expect(preset.autoApprovedTools).toContain('Write')
    for (const tool of base.autoApprovedTools) {
      expect(preset.autoApprovedTools).toContain(tool)
    }
  })

  it('clears base bash commands when clear_base_bash_commands is true', () => {
    const base = getTypePreset('kombuse')
    expect(base.autoApprovedBashCommands.length).toBeGreaterThan(0)
    const preset = getEffectivePreset('kombuse', {
      clear_base_bash_commands: true,
    })
    expect(preset.autoApprovedBashCommands).toEqual([])
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
  })

  it('clears base bash commands but adds overrides when both set', () => {
    const preset = getEffectivePreset('kombuse', {
      clear_base_bash_commands: true,
      auto_approved_bash_commands_override: ['ls'],
    })
    expect(preset.autoApprovedBashCommands).toEqual(['ls'])
  })

  it('does not clear bash commands when clear_base_bash_commands is false', () => {
    const base = getTypePreset('kombuse')
    const preset = getEffectivePreset('kombuse', {
      clear_base_bash_commands: false,
    })
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })
})

describe('getTypePreset with pluginId', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('returns plugin preset when plugin file exists', () => {
    const pluginPreset = {
      autoApprovedTools: ['Read', 'Grep'],
      autoApprovedBashCommands: ['ls'],
    }
    mockGet.mockReturnValue({ content: JSON.stringify(pluginPreset) })

    const preset = getTypePreset('kombuse', 'test-plugin-id')

    expect(mockGet).toHaveBeenCalledWith('test-plugin-id', 'presets/kombuse.json')
    expect(preset.autoApprovedTools).toEqual(['Read', 'Grep'])
    expect(preset.autoApprovedBashCommands).toEqual(['ls'])
  })

  it('falls back to hardcoded when plugin file not found', () => {
    mockGet.mockReturnValue(null)

    const preset = getTypePreset('kombuse', 'test-plugin-id')
    const hardcoded = getTypePreset('kombuse')

    expect(mockGet).toHaveBeenCalledWith('test-plugin-id', 'presets/kombuse.json')
    expect(preset.autoApprovedTools).toEqual(hardcoded.autoApprovedTools)
    expect(preset.autoApprovedBashCommands).toEqual(hardcoded.autoApprovedBashCommands)
  })

  it('falls back to hardcoded when plugin file has invalid JSON', () => {
    mockGet.mockReturnValue({ content: 'not valid json{{{' })

    const preset = getTypePreset('kombuse', 'test-plugin-id')
    const hardcoded = getTypePreset('kombuse')

    expect(preset.autoApprovedTools).toEqual(hardcoded.autoApprovedTools)
  })

  it('resolves default type when agentType is undefined', () => {
    const pluginPreset = {
      autoApprovedTools: ['Edit'],
      autoApprovedBashCommands: [],
    }
    mockGet.mockReturnValue({ content: JSON.stringify(pluginPreset) })

    const preset = getTypePreset(undefined, 'test-plugin-id')

    expect(mockGet).toHaveBeenCalledWith('test-plugin-id', 'presets/kombuse.json')
    expect(preset.autoApprovedTools).toEqual(['Edit'])
  })

  it('does not query plugin files when no pluginId', () => {
    getTypePreset('kombuse')
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('getEffectivePreset with pluginId', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockReturnValue(null)
  })

  it('merges config overrides on top of plugin preset (additive)', () => {
    const pluginPreset = {
      autoApprovedTools: ['Read', 'Grep'],
      autoApprovedBashCommands: ['ls'],
      permissionMode: 'plan',
    }
    mockGet.mockReturnValue({ content: JSON.stringify(pluginPreset) })

    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Write'],
    }, 'test-plugin-id')

    // Should have base plugin tools + override
    expect(preset.autoApprovedTools).toContain('Read')
    expect(preset.autoApprovedTools).toContain('Grep')
    expect(preset.autoApprovedTools).toContain('Write')
    expect(preset.autoApprovedBashCommands).toEqual(['ls'])
    expect(preset.permissionMode).toBe('plan')
  })
})
