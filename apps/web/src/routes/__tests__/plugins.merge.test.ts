import { describe, expect, it } from 'vitest'
import type { AvailablePlugin, Plugin } from '@kombuse/types'
import { mergePluginLists } from '../plugins'

function makeAvailable(overrides: Partial<AvailablePlugin> & { name: string }): AvailablePlugin {
  return {
    version: '1.0.0',
    source: 'project',
    installed: false,
    ...overrides,
  }
}

function makeInstalled(overrides: Partial<Plugin> & { name: string }): Plugin {
  return {
    id: crypto.randomUUID(),
    project_id: 'test-project',
    version: '1.0.0',
    description: null,
    directory: '/tmp/test',
    manifest: {
      name: overrides.name,
      version: '1.0.0',
      kombuse: {
        plugin_system_version: 'kombuse-plugin-v1',
        exported_at: '2026-01-01T00:00:00.000Z',
        labels: [],
      },
    },
    is_enabled: true,
    installed_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('mergePluginLists', () => {
  it('returns empty array for empty inputs', () => {
    expect(mergePluginLists([], [])).toEqual([])
  })

  it('includes available-only plugins', () => {
    const available = [makeAvailable({ name: 'foo', description: 'Foo plugin' })]
    const result = mergePluginLists(available, [])

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('foo')
    expect(result[0]!.installed).toBe(false)
    expect(result[0]!.availablePlugin).toBe(available[0])
    expect(result[0]!.installedPlugin).toBeUndefined()
  })

  it('includes installed-only plugins with valid kombuse manifest', () => {
    const installed = [makeInstalled({ name: 'bar' })]
    const result = mergePluginLists([], installed)

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('bar')
    expect(result[0]!.installed).toBe(true)
    expect(result[0]!.installedPlugin).toBe(installed[0])
    expect(result[0]!.availablePlugin).toBeUndefined()
  })

  it('filters out installed-only plugins without kombuse.plugin_system_version', () => {
    const installed = [
      makeInstalled({
        name: 'legacy-app',
        manifest: { name: 'legacy-app', version: '1.0.0', type: 'app' } as never,
      }),
    ]
    const result = mergePluginLists([], installed)
    expect(result).toHaveLength(0)
  })

  it('merges overlapping available and installed plugins', () => {
    const available = [makeAvailable({ name: 'shared', installed: true })]
    const installed = [makeInstalled({ name: 'shared' })]
    const result = mergePluginLists(available, installed)

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('shared')
    expect(result[0]!.installed).toBe(true)
    expect(result[0]!.availablePlugin).toBe(available[0])
    expect(result[0]!.installedPlugin).toBe(installed[0])
  })

  it('sorts installed before non-installed, then alphabetically', () => {
    const available = [
      makeAvailable({ name: 'zebra' }),
      makeAvailable({ name: 'alpha', installed: true }),
    ]
    const installed = [makeInstalled({ name: 'alpha' })]
    const result = mergePluginLists(available, installed)

    expect(result.map((p) => p.name)).toEqual(['alpha', 'zebra'])
    expect(result[0]!.installed).toBe(true)
    expect(result[1]!.installed).toBe(false)
  })
})
