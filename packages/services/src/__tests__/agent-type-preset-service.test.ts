import { describe, it, expect } from 'vitest'
import { getTypePreset, getEffectivePreset } from '../agent-type-preset-service'

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
