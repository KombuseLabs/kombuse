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

  it('overrides tools when auto_approved_tools_override is present', () => {
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Read', 'Grep'],
    })
    expect(preset.autoApprovedTools).toEqual(['Read', 'Grep'])
    const base = getTypePreset('kombuse')
    expect(preset.autoApprovedBashCommands).toEqual(base.autoApprovedBashCommands)
  })

  it('overrides bash commands when auto_approved_bash_commands_override is present', () => {
    const preset = getEffectivePreset('coder', {
      auto_approved_bash_commands_override: ['git status'],
    })
    expect(preset.autoApprovedBashCommands).toEqual(['git status'])
    const base = getTypePreset('coder')
    expect(preset.autoApprovedTools).toEqual(base.autoApprovedTools)
  })

  it('allows empty array to clear all tools', () => {
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: [],
    })
    expect(preset.autoApprovedTools).toEqual([])
  })

  it('allows empty array to clear all bash commands', () => {
    const preset = getEffectivePreset('coder', {
      auto_approved_bash_commands_override: [],
    })
    expect(preset.autoApprovedBashCommands).toEqual([])
  })

  it('preserves permissionMode from base', () => {
    const base = getTypePreset('coder')
    const preset = getEffectivePreset('coder', {
      auto_approved_tools_override: ['Read'],
    })
    expect(preset.permissionMode).toBe(base.permissionMode)
  })

  it('overrides both tools and bash commands simultaneously', () => {
    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Read'],
      auto_approved_bash_commands_override: ['ls'],
    })
    expect(preset.autoApprovedTools).toEqual(['Read'])
    expect(preset.autoApprovedBashCommands).toEqual(['ls'])
  })

  it('falls back to default preset for unknown agent type', () => {
    const preset = getEffectivePreset('unknown-type', {
      auto_approved_tools_override: ['Read'],
    })
    expect(preset.autoApprovedTools).toEqual(['Read'])
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

  it('applies config overrides on top of plugin preset', () => {
    const pluginPreset = {
      autoApprovedTools: ['Read', 'Grep'],
      autoApprovedBashCommands: ['ls'],
      permissionMode: 'plan',
    }
    mockGet.mockReturnValue({ content: JSON.stringify(pluginPreset) })

    const preset = getEffectivePreset('kombuse', {
      auto_approved_tools_override: ['Write'],
    }, 'test-plugin-id')

    expect(preset.autoApprovedTools).toEqual(['Write'])
    expect(preset.autoApprovedBashCommands).toEqual(['ls'])
    expect(preset.permissionMode).toBe('plan')
  })
})
