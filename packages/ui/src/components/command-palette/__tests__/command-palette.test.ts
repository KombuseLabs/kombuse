import { describe, it, expect } from 'vitest'
import type { Command } from '@kombuse/types'
import { filterAndGroupCommands } from '../command-palette'

function makeCommand(overrides: Partial<Command> & { id: string; title: string }): Command {
  return { handler: () => {}, ...overrides }
}

const commands: Command[] = [
  makeCommand({ id: 'chat.header', title: 'Chat Header', category: 'Navigation' }),
  makeCommand({ id: 'theme.toggle', title: 'Toggle Dark Mode', category: 'Appearance' }),
  makeCommand({
    id: 'tickets.create',
    title: 'Create Ticket',
    category: 'Tickets',
    description: 'Open the new ticket form',
  }),
]

describe('filterAndGroupCommands', () => {
  it('matches words in any order — "header chat" finds "Chat Header"', () => {
    const result = filterAndGroupCommands(commands, 'header chat')
    const titles = Object.values(result).flat().map((c) => c.title)
    expect(titles).toEqual(['Chat Header'])
  })

  it('matches words in any order — "mode toggle" finds "Toggle Dark Mode"', () => {
    const result = filterAndGroupCommands(commands, 'mode toggle')
    const titles = Object.values(result).flat().map((c) => c.title)
    expect(titles).toEqual(['Toggle Dark Mode'])
  })

  it('matches a single word as substring', () => {
    const result = filterAndGroupCommands(commands, 'chat')
    const titles = Object.values(result).flat().map((c) => c.title)
    expect(titles).toEqual(['Chat Header'])
  })

  it('returns all commands for empty query', () => {
    const result = filterAndGroupCommands(commands, '')
    const all = Object.values(result).flat()
    expect(all).toHaveLength(commands.length)
  })

  it('returns all commands for whitespace-only query', () => {
    const result = filterAndGroupCommands(commands, '   ')
    const all = Object.values(result).flat()
    expect(all).toHaveLength(commands.length)
  })

  it('returns no commands when query matches nothing', () => {
    const result = filterAndGroupCommands(commands, 'nonexistent')
    const all = Object.values(result).flat()
    expect(all).toHaveLength(0)
  })

  it('matches against category and description fields', () => {
    const result = filterAndGroupCommands(commands, 'tickets form')
    const titles = Object.values(result).flat().map((c) => c.title)
    expect(titles).toEqual(['Create Ticket'])
  })

  it('groups results by category', () => {
    const result = filterAndGroupCommands(commands, '')
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['Navigation', 'Appearance', 'Tickets'])
    )
    expect(result['Navigation']).toHaveLength(1)
    expect(result['Appearance']).toHaveLength(1)
    expect(result['Tickets']).toHaveLength(1)
  })

  it('uses "General" as default category when none specified', () => {
    const cmds = [makeCommand({ id: 'test', title: 'Test Command' })]
    const result = filterAndGroupCommands(cmds, '')
    expect(result['General']).toHaveLength(1)
  })
})
