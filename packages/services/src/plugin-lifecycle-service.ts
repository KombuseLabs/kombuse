import { join } from 'node:path'
import type {
  Plugin,
  AvailablePlugin,
  PluginUpdateCheckResult,
} from '@kombuse/types'
import {
  pluginsRepository,
  agentsRepository,
  profilesRepository,
  projectsRepository,
  getDatabase,
  getKombuseDir,
  loadKombuseConfig,
  loadProjectConfig,
} from '@kombuse/persistence'
import { buildPluginPackageManager } from './plugin-feed-builder'

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
  getAvailablePlugins(projectId: string): Promise<AvailablePlugin[]>
  checkForUpdates(pluginId: string): Promise<PluginUpdateCheckResult>
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
      const agentIds = db
        .prepare('SELECT id FROM agents WHERE plugin_id = ?')
        .all(pluginId) as { id: string }[]

      for (const { id } of agentIds) {
        agentsRepository.delete(id)
        profilesRepository.delete(id)
      }

      db.prepare('UPDATE labels SET plugin_id = NULL WHERE plugin_id = ?').run(pluginId)
    } else {
      db.prepare("UPDATE agents SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
      db.prepare("UPDATE agent_triggers SET plugin_id = NULL, updated_at = datetime('now') WHERE plugin_id = ?").run(pluginId)
      db.prepare('UPDATE labels SET plugin_id = NULL WHERE plugin_id = ?').run(pluginId)
    }

    pluginsRepository.delete(pluginId)
  }

  async getAvailablePlugins(projectId: string): Promise<AvailablePlugin[]> {
    const installed = pluginsRepository.list({ project_id: projectId })
    const installedByName = new Map(installed.map((p) => [p.name, p]))

    const { projectPluginsDir, globalPluginsDir, configSources } = this.resolvePluginConfig(projectId)

    const pm = buildPluginPackageManager(projectPluginsDir, globalPluginsDir, configSources)
    const packages = await pm.search()

    const seen = new Set<string>()
    const results: AvailablePlugin[] = []

    for (const pkg of packages) {
      if (seen.has(pkg.name)) continue
      if (pkg.manifest.type !== 'plugin') continue
      seen.add(pkg.name)

      const existingInstall = installedByName.get(pkg.name)

      results.push({
        name: pkg.name,
        version: pkg.version,
        description: pkg.manifest.description,
        directory: pkg.localPath ?? '',
        source: this.inferSource(pkg.feedId ?? ''),
        source_feed_id: pkg.feedId,
        installed: !!existingInstall,
        installed_version: existingInstall?.version,
        has_update: existingInstall
          ? pkg.version !== existingInstall.version
          : undefined,
        latest_version: pkg.version,
      })
    }

    return results
  }

  async checkForUpdates(pluginId: string): Promise<PluginUpdateCheckResult> {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    const { projectPluginsDir, globalPluginsDir, configSources } = this.resolvePluginConfig(plugin.project_id)

    const pm = buildPluginPackageManager(projectPluginsDir, globalPluginsDir, configSources)
    const result = await pm.checkForUpdates(plugin.name, plugin.version)

    return {
      plugin_id: plugin.id,
      plugin_name: plugin.name,
      has_update: result.hasUpdate,
      current_version: plugin.version,
      latest_version: result.latest?.version,
      feed_id: result.feedId,
    }
  }

  private resolvePluginConfig(projectId: string) {
    const project = projectsRepository.get(projectId)
    const projectPluginsDir = project?.local_path
      ? join(project.local_path, '.kombuse', 'plugins')
      : null
    const globalPluginsDir = join(getKombuseDir(), 'plugins')

    const globalConfig = loadKombuseConfig()
    const projectConfig = project?.local_path
      ? loadProjectConfig(project.local_path)
      : {}
    const configSources = [
      ...(globalConfig.plugins?.sources ?? []),
      ...(projectConfig.plugins?.sources ?? []),
    ]

    return { projectPluginsDir, globalPluginsDir, configSources }
  }

  private inferSource(feedId: string): AvailablePlugin['source'] {
    if (feedId.startsWith('github:')) return 'github'
    if (feedId.startsWith('http:')) return 'http'
    return 'filesystem'
  }
}

export const pluginLifecycleService = new PluginLifecycleService()
