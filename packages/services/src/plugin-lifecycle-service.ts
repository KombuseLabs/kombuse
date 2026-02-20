import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  KombusePluginManifest,
  Plugin,
  AvailablePlugin,
} from '@kombuse/types'
import {
  pluginsRepository,
  agentsRepository,
  profilesRepository,
  projectsRepository,
  getDatabase,
  getKombuseDir,
} from '@kombuse/persistence'

export class PluginNotFoundError extends Error {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`)
    this.name = 'PluginNotFoundError'
  }
}

export interface IPluginLifecycleService {
  enablePlugin(pluginId: string): Plugin
  disablePlugin(pluginId: string): Plugin
  uninstallPlugin(pluginId: string, mode: 'orphan' | 'delete'): void
  getAvailablePlugins(projectId: string): AvailablePlugin[]
}

export class PluginLifecycleService implements IPluginLifecycleService {
  enablePlugin(pluginId: string): Plugin {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    const db = getDatabase()

    db.prepare("UPDATE plugins SET is_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(pluginId)
    db.prepare("UPDATE agents SET is_enabled = 1, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
    db.prepare("UPDATE agent_triggers SET is_enabled = 1, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
    db.prepare('UPDATE labels SET is_enabled = 1 WHERE plugin_id = ?').run(pluginId)

    return pluginsRepository.get(pluginId)!
  }

  disablePlugin(pluginId: string): Plugin {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    const db = getDatabase()

    db.prepare("UPDATE plugins SET is_enabled = 0, updated_at = datetime('now') WHERE id = ?").run(pluginId)
    db.prepare("UPDATE agents SET is_enabled = 0, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
    db.prepare("UPDATE agent_triggers SET is_enabled = 0, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
    db.prepare('UPDATE labels SET is_enabled = 0 WHERE plugin_id = ?').run(pluginId)

    return pluginsRepository.get(pluginId)!
  }

  uninstallPlugin(pluginId: string, mode: 'orphan' | 'delete' = 'orphan'): void {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    const db = getDatabase()

    if (mode === 'delete') {
      // Get agent IDs for profile cleanup
      const agentIds = db
        .prepare('SELECT id FROM agents WHERE plugin_id = ?')
        .all(pluginId) as { id: string }[]

      // Delete agents (triggers cascade via FK)
      for (const { id } of agentIds) {
        agentsRepository.delete(id)
        profilesRepository.delete(id)
      }

      // Delete labels
      db.prepare('DELETE FROM labels WHERE plugin_id = ?').run(pluginId)
    } else {
      // Orphan: null out plugin_id on all entities
      db.prepare("UPDATE agents SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
      db.prepare("UPDATE agent_triggers SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
      db.prepare('UPDATE labels SET plugin_id = NULL WHERE plugin_id = ?').run(pluginId)
    }

    // Delete the plugin row
    pluginsRepository.delete(pluginId)
  }

  getAvailablePlugins(projectId: string): AvailablePlugin[] {
    const results: AvailablePlugin[] = []

    // Get installed plugins for this project
    const installed = pluginsRepository.list({ project_id: projectId })
    const installedNames = new Set(installed.map((p) => p.name))

    // Scan project's .kombuse/plugins/ directory
    const project = projectsRepository.get(projectId)
    if (project?.local_path) {
      const projectPluginsDir = join(project.local_path, '.kombuse', 'plugins')
      this.scanDirectory(projectPluginsDir, 'project', installedNames, results)
    }

    // Scan global ~/.kombuse/plugins/ directory
    const globalPluginsDir = join(getKombuseDir(), 'plugins')
    this.scanDirectory(globalPluginsDir, 'global', installedNames, results)

    return results
  }

  private scanDirectory(
    dir: string,
    source: 'project' | 'global',
    installedNames: Set<string>,
    results: AvailablePlugin[]
  ): void {
    if (!existsSync(dir)) return

    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const manifestPath = join(dir, entry.name, '.claude-plugin', 'plugin.json')
      if (!existsSync(manifestPath)) continue

      try {
        const raw = readFileSync(manifestPath, 'utf-8')
        const manifest = JSON.parse(raw) as KombusePluginManifest

        if (!manifest.name || !manifest.kombuse?.plugin_system_version) continue

        // Skip if already in results (project takes precedence over global)
        if (results.some((r) => r.name === manifest.name)) continue

        results.push({
          name: manifest.name,
          version: manifest.version ?? '1.0.0',
          description: manifest.description,
          directory: join(dir, entry.name),
          source,
          installed: installedNames.has(manifest.name),
        })
      } catch {
        // Skip directories with invalid manifests
      }
    }
  }
}

export const pluginLifecycleService = new PluginLifecycleService()
