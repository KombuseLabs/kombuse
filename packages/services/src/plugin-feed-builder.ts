import { join } from 'node:path'
import { PackageManager } from '@kombuse/pkg'
import { FilesystemFeed, GitHubFeed, HttpFeed } from '@kombuse/pkg/feeds'
import type { FeedAuth } from '@kombuse/pkg'
import type { PluginSourceConfig } from '@kombuse/types'
import {
  resolveEnvToken,
  projectsRepository,
  getKombuseDir,
  getEffectiveProjectPath,
  loadKombuseConfig,
  loadProjectConfig,
} from '@kombuse/persistence'

function resolveAuth(token?: string): FeedAuth | undefined {
  if (!token) return undefined
  return { token: resolveEnvToken(token), type: 'bearer' }
}

export function resolvePluginConfig(projectId: string) {
  const project = projectsRepository.get(projectId)
  const effectivePath = project ? getEffectiveProjectPath(project) : null
  const projectPluginsDir = effectivePath
    ? join(effectivePath, '.kombuse', 'plugins')
    : null
  const globalPluginsDir = join(getKombuseDir(), 'plugins')

  const globalConfig = loadKombuseConfig()
  const projectConfig = effectivePath
    ? loadProjectConfig(effectivePath)
    : {}
  const configSources = [
    ...(globalConfig.plugins?.sources ?? []),
    ...(projectConfig.plugins?.sources ?? []),
  ]

  return { projectPluginsDir, globalPluginsDir, configSources }
}

export function buildPluginPackageManager(
  projectPluginsDir: string | null,
  globalPluginsDir: string,
  configSources: PluginSourceConfig[] = []
): PackageManager {
  const pm = new PackageManager()

  if (projectPluginsDir) {
    pm.addFeed(new FilesystemFeed({ directory: projectPluginsDir }))
  }
  pm.addFeed(new FilesystemFeed({ directory: globalPluginsDir }))

  for (const source of configSources) {
    switch (source.type) {
      case 'filesystem':
        pm.addFeed(new FilesystemFeed({ directory: source.path }))
        break
      case 'github':
        pm.addFeed(
          new GitHubFeed({
            repo: source.repo,
            packageName: source.package_name ?? source.repo.split('/').pop()!,
            packageType: 'plugin',
            auth: resolveAuth(source.token),
          })
        )
        break
      case 'http':
        pm.addFeed(
          new HttpFeed({
            baseUrl: source.base_url,
            auth: resolveAuth(source.token),
            cacheTtlMs: 5 * 60 * 1000,
          })
        )
        break
    }
  }

  // Built-in kombuse.dev registry (public reads, no auth needed)
  pm.addFeed(
    new HttpFeed({
      baseUrl: 'https://kombuse.dev',
      cacheTtlMs: 5 * 60 * 1000,
    })
  )

  return pm
}
