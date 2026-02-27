import type {
  Plugin,
  AvailablePlugin,
  PluginUpdateCheckResult,
} from '@kombuse/types'
import {
  pluginsRepository,
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  profilesRepository,
} from '@kombuse/persistence'
import { isNewerVersion } from '@kombuse/pkg'
import { buildPluginPackageManager, resolvePluginConfig } from './plugin-feed-builder'

export class PluginNotFoundError extends Error {
  constructor(pluginId: string) {
    super(`Plugin not found: ${pluginId}`)
    this.name = 'PluginNotFoundError'
  }
}

export class PluginLifecycleService {
  setPluginEnabled(pluginId: string, enabled: boolean): Plugin {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    if (enabled) {
      pluginsRepository.enable(pluginId)
      agentsRepository.enableByPlugin(pluginId)
      agentTriggersRepository.enableByPlugin(pluginId)
      labelsRepository.enableByPlugin(pluginId)
    } else {
      pluginsRepository.disable(pluginId)
      agentsRepository.disableByPlugin(pluginId)
      agentTriggersRepository.disableByPlugin(pluginId)
      labelsRepository.disableByPlugin(pluginId)
    }

    return pluginsRepository.get(pluginId)!
  }

  uninstallPlugin(pluginId: string, mode: 'orphan' | 'delete' = 'orphan'): void {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    if (mode === 'delete') {
      const agentIds = agentsRepository.listIdsByPlugin(pluginId)

      for (const id of agentIds) {
        agentsRepository.delete(id)
        profilesRepository.delete(id)
      }

      labelsRepository.orphanByPlugin(pluginId)
    } else {
      agentsRepository.orphanByPlugin(pluginId)
      agentTriggersRepository.orphanByPlugin(pluginId)
      labelsRepository.orphanByPlugin(pluginId)
    }

    pluginsRepository.delete(pluginId)
  }

  async getAvailablePlugins(projectId: string): Promise<AvailablePlugin[]> {
    const installed = pluginsRepository.list({ project_id: projectId })
    const installedByName = new Map(installed.map((p) => [p.name, p]))

    const { projectPluginsDir, globalPluginsDir, configSources } = resolvePluginConfig(projectId)

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
        directory: pkg.localPath || undefined,
        source: this.inferSource(pkg.feedId ?? ''),
        source_feed_id: pkg.feedId,
        installed: !!existingInstall,
        installed_version: existingInstall?.version,
        has_update: existingInstall
          ? isNewerVersion(pkg.version, existingInstall.version)
          : undefined,
        latest_version: pkg.version,
      })
    }

    return results
  }

  async checkForUpdates(pluginId: string): Promise<PluginUpdateCheckResult> {
    const plugin = pluginsRepository.get(pluginId)
    if (!plugin) throw new PluginNotFoundError(pluginId)

    const { projectPluginsDir, globalPluginsDir, configSources } = resolvePluginConfig(plugin.project_id)

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

  private inferSource(feedId: string): AvailablePlugin['source'] {
    if (feedId.startsWith('github:')) return 'github'
    if (feedId.startsWith('http:')) return 'http'
    return 'filesystem'
  }
}

export const pluginLifecycleService = new PluginLifecycleService()
