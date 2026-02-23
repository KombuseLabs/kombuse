import { describe, it, expect } from 'vitest'
import {
  getTypePreset,
  shouldAutoApprove,
  presetToAllowedTools,
  type AgentTypePreset,
} from '../services/agent-execution-service'

describe('getTypePreset', () => {
  it('returns kombuse preset for "kombuse"', () => {
    const preset = getTypePreset('kombuse')
    expect(preset.autoApprovedTools).toContain('mcp__kombuse__get_ticket')
    expect(preset.autoApprovedTools).toContain('mcp__kombuse__get_ticket_comment')
    expect(preset.autoApprovedBashCommands).toContain('git show')
  })

  it('returns coder preset for "coder"', () => {
    const preset = getTypePreset('coder')
    expect(preset.autoApprovedTools).toContain('Edit')
    expect(preset.autoApprovedTools).toContain('Write')
    expect(preset.autoApprovedTools).toContain('Bash')
    expect(preset.autoApprovedBashCommands).toContain('bun')
  })

  it('returns generic preset for "generic"', () => {
    const preset = getTypePreset('generic')
    expect(preset.autoApprovedTools).toContain('Grep')
    expect(preset.autoApprovedTools).toContain('Glob')
    expect(preset.autoApprovedTools).toContain('Read')
    expect(preset.autoApprovedTools).not.toContain('mcp__kombuse__get_ticket')
  })

  it('falls back to kombuse for unknown type', () => {
    const preset = getTypePreset('foo')
    const kombuse = getTypePreset('kombuse')
    expect(preset).toBe(kombuse)
  })

  it('falls back to kombuse for undefined', () => {
    const preset = getTypePreset(undefined)
    const kombuse = getTypePreset('kombuse')
    expect(preset).toBe(kombuse)
  })

  it('falls back to kombuse for empty string', () => {
    const preset = getTypePreset('')
    const kombuse = getTypePreset('kombuse')
    expect(preset).toBe(kombuse)
  })
})

describe('shouldAutoApprove', () => {
  const kombusePreset = getTypePreset('kombuse')
  const coderPreset = getTypePreset('coder')

  it('approves tool in preset autoApprovedTools list', () => {
    expect(shouldAutoApprove('mcp__kombuse__get_ticket', undefined, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('mcp__kombuse__get_ticket_comment', undefined, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Grep', undefined, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Read', undefined, kombusePreset)).toBe(true)
  })

  it('rejects tool not in preset autoApprovedTools list', () => {
    expect(shouldAutoApprove('Edit', undefined, kombusePreset)).toBe(false)
    expect(shouldAutoApprove('Write', undefined, kombusePreset)).toBe(false)
    expect(shouldAutoApprove('Bash', undefined, kombusePreset)).toBe(false)
  })

  it('approves Bash command matching exact prefix', () => {
    expect(shouldAutoApprove('Bash', { command: 'bun' }, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'npm' }, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git status' }, coderPreset)).toBe(true)
  })

  it('approves Bash command starting with prefix + space', () => {
    expect(shouldAutoApprove('Bash', { command: 'bun test' }, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'npm install' }, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git status --short' }, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git diff HEAD~1' }, coderPreset)).toBe(true)
  })

  it('rejects Bash command that starts with prefix but no space separator', () => {
    const bashPrefixOnlyPreset: AgentTypePreset = {
      autoApprovedTools: [],
      autoApprovedBashCommands: ['bun', 'npm', 'git status'],
    }
    expect(shouldAutoApprove('Bash', { command: 'bunx' }, bashPrefixOnlyPreset)).toBe(false)
    expect(shouldAutoApprove('Bash', { command: 'npmrc' }, bashPrefixOnlyPreset)).toBe(false)
    expect(shouldAutoApprove('Bash', { command: 'git statusx' }, bashPrefixOnlyPreset)).toBe(false)
  })

  it('approves git read commands for kombuse preset', () => {
    expect(shouldAutoApprove('Bash', { command: 'git show abc123' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git show' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git status' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git diff HEAD~1' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git log --oneline' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git branch -a' }, kombusePreset)).toBe(true)
    expect(shouldAutoApprove('Bash', { command: 'git rev-parse HEAD' }, kombusePreset)).toBe(true)
  })

  it('rejects non-approved Bash commands for kombuse preset', () => {
    expect(shouldAutoApprove('Bash', { command: 'bun test' }, kombusePreset)).toBe(false)
    expect(shouldAutoApprove('Bash', { command: 'ls' }, kombusePreset)).toBe(false)
    expect(shouldAutoApprove('Bash', { command: 'git push' }, kombusePreset)).toBe(false)
    expect(shouldAutoApprove('Bash', { command: 'git commit -m "x"' }, kombusePreset)).toBe(false)
  })

  it('handles undefined input gracefully for non-approved Bash', () => {
    expect(shouldAutoApprove('Bash', undefined, coderPreset)).toBe(true)
    expect(shouldAutoApprove('Bash', undefined, kombusePreset)).toBe(false)
  })

  it('handles Bash with missing command property', () => {
    expect(shouldAutoApprove('Bash', {}, kombusePreset)).toBe(false)
  })
})

describe('preset contents', () => {
  it('kombuse preset includes all MCP tools and read tools', () => {
    const preset = getTypePreset('kombuse')
    const expectedTools = [
      'mcp__kombuse__get_ticket',
      'mcp__kombuse__get_ticket_comment',
      'mcp__kombuse__add_comment',
      'mcp__kombuse__create_ticket',
      'mcp__kombuse__update_comment',
      'mcp__kombuse__update_ticket',
      'mcp__kombuse__list_labels',
      'mcp__kombuse__query_db',
      'mcp__kombuse__list_tables',
      'mcp__kombuse__describe_table',
      'Grep',
      'Glob',
      'Read',
    ]
    for (const tool of expectedTools) {
      expect(preset.autoApprovedTools, `missing ${tool}`).toContain(tool)
    }
  })

  it('kombuse preset has git read commands in autoApprovedBashCommands', () => {
    const preset = getTypePreset('kombuse')
    expect(preset.autoApprovedBashCommands).toContain('git status')
    expect(preset.autoApprovedBashCommands).toContain('git diff')
    expect(preset.autoApprovedBashCommands).toContain('git log')
    expect(preset.autoApprovedBashCommands).toContain('git show')
    expect(preset.autoApprovedBashCommands).toContain('git branch')
    expect(preset.autoApprovedBashCommands).toContain('git rev-parse')
  })

  it('kombuse preset does not include write tools', () => {
    const preset = getTypePreset('kombuse')
    expect(preset.autoApprovedTools).not.toContain('Edit')
    expect(preset.autoApprovedTools).not.toContain('Write')
    expect(preset.autoApprovedTools).not.toContain('Bash')
  })

  it('coder preset includes write tools', () => {
    const preset = getTypePreset('coder')
    expect(preset.autoApprovedTools).toContain('Edit')
    expect(preset.autoApprovedTools).toContain('Write')
    expect(preset.autoApprovedTools).toContain('Bash')
    expect(preset.autoApprovedTools).toContain('Task')
    expect(preset.autoApprovedTools).toContain('TodoWrite')
  })

  it('coder preset has bash prefixes for build and git commands', () => {
    const preset = getTypePreset('coder')
    expect(preset.autoApprovedBashCommands).toContain('bun')
    expect(preset.autoApprovedBashCommands).toContain('npm')
    expect(preset.autoApprovedBashCommands).toContain('git status')
    expect(preset.autoApprovedBashCommands).toContain('git diff')
    expect(preset.autoApprovedBashCommands).toContain('git log')
  })
})

describe('presetToAllowedTools', () => {
  it('converts kombuse preset to allowed tools list with git Bash patterns', () => {
    const preset = getTypePreset('kombuse')
    const tools = presetToAllowedTools(preset)

    expect(tools).toContain('mcp__kombuse__get_ticket')
    expect(tools).toContain('mcp__kombuse__get_ticket_comment')
    expect(tools).toContain('Grep')
    expect(tools).toContain('Glob')
    expect(tools).toContain('Read')
    expect(tools).not.toContain('Bash')
    expect(tools).toContain('Bash(git show *)')
    expect(tools).toContain('Bash(git status *)')
    expect(tools).toContain('Bash(git diff *)')
    expect(tools).toContain('Bash(git log *)')
    expect(tools).toContain('Bash(git branch *)')
    expect(tools).toContain('Bash(git rev-parse *)')
  })

  it('converts coder preset - Bash in autoApprovedTools covers all commands', () => {
    const preset = getTypePreset('coder')
    const tools = presetToAllowedTools(preset)

    expect(tools).toContain('Bash')
    expect(tools).toContain('Edit')
    expect(tools).toContain('Write')
    expect(tools).toContain('Task')
    expect(tools.filter(t => t.startsWith('Bash(')).length).toBe(0)
  })

  it('converts custom preset with bash commands but no Bash tool', () => {
    const customPreset: AgentTypePreset = {
      autoApprovedTools: ['Read', 'Grep'],
      autoApprovedBashCommands: ['npm', 'git status'],
    }
    const tools = presetToAllowedTools(customPreset)

    expect(tools).toContain('Read')
    expect(tools).toContain('Grep')
    expect(tools).toContain('Bash(npm *)')
    expect(tools).toContain('Bash(git status *)')
    expect(tools).not.toContain('Bash')
  })

  it('returns empty array for empty preset', () => {
    const emptyPreset: AgentTypePreset = {
      autoApprovedTools: [],
      autoApprovedBashCommands: [],
    }
    expect(presetToAllowedTools(emptyPreset)).toEqual([])
  })
})
