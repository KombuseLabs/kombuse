import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import * as yaml from 'js-yaml'
import type {
  KombusePluginManifest,
  AgentExportFrontmatter,
  PluginInstallInput,
  PluginInstallResult,
  PluginRemoteInstallInput,
  AgentConfig,
  PluginBase,
  UpdateAgentInput,
} from '@kombuse/types'
import { SELF_PLACEHOLDER, toSlug } from '@kombuse/types'
import {
  pluginsRepository,
  pluginFilesRepository,
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  profilesRepository,
  getDatabase,
} from '@kombuse/persistence'
import { buildPluginPackageManager, resolvePluginConfig } from './plugin-feed-builder'

export class PluginAlreadyInstalledError extends Error {
  public readonly pluginName: string

  constructor(pluginName: string) {
    super(`Plugin "${pluginName}" is already installed`)
    this.name = 'PluginAlreadyInstalledError'
    this.pluginName = pluginName
  }
}

export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidManifestError'
  }
}

function isFieldCustomized(currentValue: unknown, oldBaseValue: unknown): boolean {
  if (typeof currentValue === 'object' || typeof oldBaseValue === 'object') {
    return JSON.stringify(currentValue) !== JSON.stringify(oldBaseValue)
  }
  return currentValue !== oldBaseValue
}

export interface IPluginImportService {
  installPackage(input: PluginInstallInput): PluginInstallResult
  installFromRemote(input: PluginRemoteInstallInput): Promise<PluginInstallResult>
}

export class PluginImportService implements IPluginImportService {
  installPackage(input: PluginInstallInput): PluginInstallResult {
    const { package_path, project_id, overwrite } = input

    // Step 1: Read and validate manifest
    const manifest = this.readManifest(package_path)

    // Step 2: Check for existing install
    const existing = pluginsRepository.getByName(project_id, manifest.name)
    if (existing && !overwrite) {
      throw new PluginAlreadyInstalledError(manifest.name)
    }
    let oldPluginAgentIds = new Set<string>()
    let oldLabelsBySlug = new Map<string, number>()
    if (existing && overwrite) {
      const db = getDatabase()
      const oldAgents = db
        .prepare('SELECT id FROM agents WHERE plugin_id = ?')
        .all(existing.id) as { id: string }[]
      oldPluginAgentIds = new Set(oldAgents.map((a) => a.id))
      const oldLabels = db
        .prepare('SELECT id, slug FROM labels WHERE plugin_id = ?')
        .all(existing.id) as { id: number; slug: string }[]
      oldLabelsBySlug = new Map(oldLabels.map((l) => [l.slug, l.id]))
    }

    // Step 3: Create or update plugin row
    // On overwrite, UPDATE in place to avoid FK CASCADE SET NULL side effects
    // (deleting the plugin would orphan profiles and collide with other projects)
    const pluginId = existing?.id ?? crypto.randomUUID()
    if (existing && overwrite) {
      pluginsRepository.update(pluginId, {
        version: manifest.version,
        description: manifest.description,
        directory: package_path,
        manifest: JSON.stringify(manifest),
      })
    } else {
      pluginsRepository.create({
        id: pluginId,
        project_id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        directory: package_path,
        manifest: JSON.stringify(manifest),
      })
    }

    const warnings: string[] = []
    let labelsCreated = 0
    let labelsMerged = 0
    let agentsCreated = 0
    let agentsUpdated = 0
    let triggersCreated = 0
    let triggersUpdated = 0
    let filesImported = 0
    let filesPreserved = 0
    const importedAgentIds = new Set<string>()

    // Step 4: Import labels
    const labelNameToId = new Map<string, number>()
    const labelNameToSlug = new Map<string, string | null>()
    const importedLabelSlugs = new Set<string>()

    // Preload existing project labels
    const existingLabels = labelsRepository.getByProject(project_id)
    for (const label of existingLabels) {
      labelNameToId.set(label.name, label.id)
      labelNameToSlug.set(label.name, label.slug)
    }

    if (manifest.kombuse?.labels) {
      for (const exportedLabel of manifest.kombuse.labels) {
        const slug = toSlug(exportedLabel.name)
        importedLabelSlugs.add(slug)
        const existingLabel = labelsRepository.getBySlugAndPlugin(slug, project_id, pluginId)
          ?? existingLabels.find((l) => l.name === exportedLabel.name)

        if (existingLabel) {
          // Merge: link existing label to this plugin and ensure slug is set
          labelsRepository.update(existingLabel.id, {
            plugin_id: pluginId,
            slug,
            description: exportedLabel.description ?? existingLabel.description ?? undefined,
            color: exportedLabel.color ?? existingLabel.color,
          })
          labelsMerged++
        } else {
          // Create new label
          const label = labelsRepository.create({
            project_id,
            name: exportedLabel.name,
            slug,
            color: exportedLabel.color,
            description: exportedLabel.description ?? undefined,
            plugin_id: pluginId,
          })
          labelNameToId.set(label.name, label.id)
          labelNameToSlug.set(label.name, label.slug)
          labelsCreated++
        }
      }
    }

    // Step 4b: Remap ticket-label associations and orphan removed labels
    if (oldLabelsBySlug.size > 0) {
      const newLabelsBySlug = new Map<string, number>()
      const currentLabels = labelsRepository.getByProject(project_id, true)
      for (const label of currentLabels) {
        if (label.plugin_id === pluginId && label.slug) {
          newLabelsBySlug.set(label.slug, label.id)
        }
      }

      for (const [slug, oldLabelId] of oldLabelsBySlug) {
        const newLabelId = newLabelsBySlug.get(slug)
        if (newLabelId && newLabelId !== oldLabelId) {
          labelsRepository.remapTicketLabels(oldLabelId, newLabelId)
          labelsRepository.delete(oldLabelId)
        } else if (!importedLabelSlugs.has(slug)) {
          // Label was removed from manifest — orphan it (detach from plugin)
          labelsRepository.update(oldLabelId, { plugin_id: null })
        }
      }
    }

    // Step 4c: Import plugin files
    const filesDir = join(package_path, 'files')
    if (existsSync(filesDir)) {
      const fileStats = this.importPluginFiles(pluginId, filesDir)
      filesImported += fileStats.imported
      filesPreserved += fileStats.preserved
    }

    // Step 5: Import agents
    const agentsDir = join(package_path, 'agents')
    if (existsSync(agentsDir)) {
      const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))

      for (const file of files) {
        const content = readFileSync(join(agentsDir, file), 'utf-8')
        const { frontmatter, systemPrompt } = this.parseAgentMarkdown(content)

        const slug = frontmatter.slug ?? file.replace(/\.md$/, '')

        // Build agent config (reverse the "promoted config keys" extraction)
        const config: AgentConfig = {
          ...(frontmatter.config ?? {}),
          type: frontmatter.type ?? 'kombuse',
          model: frontmatter.model ?? undefined,
          backend_type: (frontmatter.backend_type as AgentConfig['backend_type']) ?? undefined,
          enabled_for_chat: frontmatter.enabled_for_chat ?? false,
        }

        const existingAgent = agentsRepository.getBySlugAndPlugin(slug, pluginId)
          ?? agentsRepository.getBySlugAndProject(slug, project_id)

        if (existingAgent) {
          // Update existing agent in place
          const agentId = existingAgent.id

          profilesRepository.update(agentId, {
            name: frontmatter.name,
            description: frontmatter.description ?? undefined,
            avatar_url: frontmatter.avatar ?? undefined,
          })

          // Build the new plugin base snapshot
          const newPluginBase: PluginBase = {
            system_prompt: systemPrompt,
            permissions: frontmatter.permissions ?? [],
            config,
            is_enabled: frontmatter.is_enabled !== false,
          }

          // Field-level comparison: only overwrite fields the user hasn't customized
          const oldBase = existingAgent.plugin_base
          const updateFields: UpdateAgentInput = {
            plugin_id: pluginId,
            project_id,
            plugin_base: newPluginBase,
          }

          if (!oldBase || !isFieldCustomized(existingAgent.system_prompt, oldBase.system_prompt)) {
            updateFields.system_prompt = systemPrompt
          }
          if (!oldBase || !isFieldCustomized(existingAgent.permissions, oldBase.permissions)) {
            updateFields.permissions = frontmatter.permissions ?? []
          }
          if (!oldBase || !isFieldCustomized(existingAgent.config, oldBase.config)) {
            updateFields.config = config
          }
          if (!oldBase || !isFieldCustomized(existingAgent.is_enabled, oldBase.is_enabled)) {
            updateFields.is_enabled = frontmatter.is_enabled !== false
          }

          agentsRepository.update(agentId, updateFields)

          // Sync triggers: match by slug, preserve user customizations
          const triggerSync = this.syncAgentTriggers(
            agentId, frontmatter.triggers, pluginId, project_id, labelNameToId, labelNameToSlug
          )
          triggersCreated += triggerSync.created
          triggersUpdated += triggerSync.updated

          importedAgentIds.add(agentId)
          agentsUpdated++
        } else {
          // Check for a soft-deleted profile from a previous install of this plugin,
          // or an orphaned profile (plugin_id NULL from a previous uninstall)
          const existingProfile = profilesRepository.getBySlugAndPlugin(slug, pluginId)
            ?? profilesRepository.getBySlugOrphaned(slug)

          // Guard: if the profile's agent already exists (e.g. in another project),
          // don't reuse it — create a fresh agent+profile pair
          const reusableProfile = existingProfile && !agentsRepository.get(existingProfile.id)
            ? existingProfile
            : null
          const agentId = reusableProfile?.id ?? crypto.randomUUID()

          if (reusableProfile) {
            // Reactivate the profile
            profilesRepository.update(agentId, {
              name: frontmatter.name,
              description: frontmatter.description ?? undefined,
              avatar_url: frontmatter.avatar ?? undefined,
              plugin_id: pluginId,
              is_active: true,
            })
          } else {
            // Create brand new profile
            profilesRepository.create({
              id: agentId,
              type: 'agent',
              slug,
              name: frontmatter.name,
              description: frontmatter.description ?? undefined,
              avatar_url: frontmatter.avatar ?? undefined,
              plugin_id: pluginId,
            })
          }

          const pluginBase: PluginBase = {
            system_prompt: systemPrompt,
            permissions: frontmatter.permissions ?? [],
            config,
            is_enabled: frontmatter.is_enabled !== false,
          }

          agentsRepository.create({
            id: agentId,
            name: frontmatter.name,
            description: frontmatter.description ?? '',
            slug,
            system_prompt: systemPrompt,
            permissions: frontmatter.permissions ?? [],
            config,
            is_enabled: frontmatter.is_enabled !== false,
            plugin_id: pluginId,
            project_id,
            plugin_base: pluginBase,
          })

          triggersCreated += this.importAgentTriggers(
            agentId, frontmatter.triggers, pluginId, project_id, labelNameToId, labelNameToSlug
          )

          importedAgentIds.add(agentId)
          agentsCreated++
        }
      }
    }

    // Clean up agents from old plugin that are not in the new manifest
    for (const oldId of oldPluginAgentIds) {
      if (!importedAgentIds.has(oldId)) {
        agentsRepository.delete(oldId)
        profilesRepository.delete(oldId)
      }
    }

    return {
      plugin_id: pluginId,
      plugin_name: manifest.name,
      agents_created: agentsCreated,
      agents_updated: agentsUpdated,
      labels_created: labelsCreated,
      labels_merged: labelsMerged,
      triggers_created: triggersCreated,
      triggers_updated: triggersUpdated,
      files_imported: filesImported,
      files_preserved: filesPreserved,
      warnings,
    }
  }

  private importPluginFiles(
    pluginId: string,
    filesDir: string,
    basePath?: string
  ): { imported: number; preserved: number } {
    const base = basePath ?? filesDir
    let imported = 0
    let preserved = 0

    const entries = readdirSync(filesDir)
    for (const entry of entries) {
      const fullPath = join(filesDir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        const sub = this.importPluginFiles(pluginId, fullPath, base)
        imported += sub.imported
        preserved += sub.preserved
      } else {
        const filePath = relative(base, fullPath)
        const content = readFileSync(fullPath, 'utf-8')
        const existing = pluginFilesRepository.get(pluginId, filePath)

        if (existing?.is_user_modified) {
          preserved++
        } else {
          pluginFilesRepository.upsert({
            plugin_id: pluginId,
            path: filePath,
            content,
          })
          imported++
        }
      }
    }

    return { imported, preserved }
  }

  private readManifest(packagePath: string): KombusePluginManifest {
    const manifestPath = join(packagePath, '.claude-plugin', 'plugin.json')

    if (!existsSync(manifestPath)) {
      throw new InvalidManifestError(
        `No plugin.json found at ${manifestPath}`
      )
    }

    try {
      const raw = readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(raw) as KombusePluginManifest

      if (!manifest.name) {
        throw new InvalidManifestError('Manifest missing required field: name')
      }
      if (!manifest.kombuse?.plugin_system_version) {
        throw new InvalidManifestError(
          'Manifest missing required field: kombuse.plugin_system_version'
        )
      }

      return manifest
    } catch (error) {
      if (error instanceof InvalidManifestError) throw error
      throw new InvalidManifestError(
        `Failed to parse plugin.json: ${(error as Error).message}`
      )
    }
  }

  parseAgentMarkdown(content: string): {
    frontmatter: AgentExportFrontmatter
    systemPrompt: string
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
    if (!match) {
      throw new InvalidManifestError('Invalid agent markdown: missing YAML frontmatter')
    }

    const frontmatter = yaml.load(match[1]!) as AgentExportFrontmatter
    const systemPrompt = match[2]!.replace(/\n$/, '')

    return { frontmatter, systemPrompt }
  }

  private resolveLabelNames(
    conditions: Record<string, unknown> | null,
    labelNameToId: Map<string, number>,
    labelNameToSlug: Map<string, string | null>
  ): Record<string, unknown> | null {
    if (!conditions) return null

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'label_name' && typeof value === 'string') {
        const labelId = labelNameToId.get(value)
        if (labelId !== undefined) {
          result['label_id'] = labelId
          const slug = labelNameToSlug.get(value)
          if (slug) {
            result['label_slug'] = slug
          }
        } else {
          // Keep the label_name if we can't resolve it
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }
    return result
  }

  private resolveSelfPlaceholder(
    conditions: Record<string, unknown> | null,
    agentId: string
  ): Record<string, unknown> | null {
    if (!conditions) return null

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(conditions)) {
      result[key] = value === SELF_PLACEHOLDER ? agentId : value
    }
    return result
  }

  private importAgentTriggers(
    agentId: string,
    triggers: AgentExportFrontmatter['triggers'],
    pluginId: string,
    projectId: string,
    labelNameToId: Map<string, number>,
    labelNameToSlug: Map<string, string | null>
  ): number {
    if (!triggers) return 0
    let count = 0
    const slugCounts = new Map<string, number>()
    for (const trigger of triggers) {
      const baseSlug = trigger.slug ?? toSlug(trigger.event_type)
      const slugCount = (slugCounts.get(baseSlug) ?? 0) + 1
      slugCounts.set(baseSlug, slugCount)
      const slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`

      const conditions = this.resolveLabelNames(trigger.conditions, labelNameToId, labelNameToSlug)
      const resolvedConditions = this.resolveSelfPlaceholder(conditions, agentId)

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: trigger.event_type,
        slug,
        project_id: trigger.project_id ?? projectId,
        conditions: resolvedConditions ?? undefined,
        is_enabled: trigger.is_enabled !== false,
        priority: trigger.priority ?? 0,
        plugin_id: pluginId,
      })
      count++
    }
    return count
  }

  private syncAgentTriggers(
    agentId: string,
    triggers: AgentExportFrontmatter['triggers'],
    pluginId: string,
    projectId: string,
    labelNameToId: Map<string, number>,
    labelNameToSlug: Map<string, string | null>
  ): { created: number; updated: number } {
    if (!triggers || triggers.length === 0) {
      // Delete all plugin triggers and orphaned triggers for this agent
      const allTriggers = agentTriggersRepository.listByAgent(agentId)
      for (const t of allTriggers) {
        if (t.plugin_id === pluginId || (t.plugin_id === null && t.slug)) {
          agentTriggersRepository.delete(t.id)
        }
      }
      return { created: 0, updated: 0 }
    }

    let created = 0
    let updated = 0
    const processedSlugs = new Set<string>()
    const slugCounts = new Map<string, number>()

    for (const trigger of triggers) {
      const baseSlug = trigger.slug ?? toSlug(trigger.event_type)
      const slugCount = (slugCounts.get(baseSlug) ?? 0) + 1
      slugCounts.set(baseSlug, slugCount)
      const slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`

      const conditions = this.resolveLabelNames(trigger.conditions, labelNameToId, labelNameToSlug)
      const resolvedConditions = this.resolveSelfPlaceholder(conditions, agentId)

      // Try plugin-scoped match first, then fallback to orphaned trigger (NULL plugin_id from overwrite)
      const existing = agentTriggersRepository.getBySlugAndAgent(slug, agentId, pluginId)
        ?? agentTriggersRepository.getBySlugAndAgent(slug, agentId, null)

      if (existing) {
        agentTriggersRepository.update(existing.id, {
          event_type: trigger.event_type,
          conditions: resolvedConditions ?? null,
          priority: trigger.priority ?? 0,
          project_id: trigger.project_id ?? projectId,
          plugin_id: pluginId,
        })
        updated++
      } else {
        agentTriggersRepository.create({
          agent_id: agentId,
          event_type: trigger.event_type,
          slug,
          project_id: trigger.project_id ?? projectId,
          conditions: resolvedConditions ?? undefined,
          is_enabled: trigger.is_enabled !== false,
          priority: trigger.priority ?? 0,
          plugin_id: pluginId,
        })
        created++
      }
      processedSlugs.add(slug)
    }

    // Delete triggers from old plugin version that are no longer in manifest
    // Also clean up orphaned triggers (NULL plugin_id from overwrite delete)
    const allAgentTriggers = agentTriggersRepository.listByAgent(agentId)
    for (const t of allAgentTriggers) {
      if ((t.plugin_id === pluginId || t.plugin_id === null) && t.slug && !processedSlugs.has(t.slug)) {
        agentTriggersRepository.delete(t.id)
      }
    }

    return { created, updated }
  }

  async installFromRemote(input: PluginRemoteInstallInput): Promise<PluginInstallResult> {
    const { name, version, project_id, overwrite } = input

    const { projectPluginsDir, globalPluginsDir, configSources } = resolvePluginConfig(project_id)
    const pm = buildPluginPackageManager(projectPluginsDir, globalPluginsDir, configSources)

    const result = version
      ? await pm.install(name, version)
      : await pm.installLatest(name)

    // Cache content is at {cachePath}/content
    const packagePath = join(result.cachePath, 'content')

    return this.installPackage({
      package_path: packagePath,
      project_id,
      overwrite,
    })
  }
}

export const pluginImportService = new PluginImportService()
