import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import type {
  KombusePluginManifest,
  AgentExportFrontmatter,
  PluginInstallInput,
  PluginInstallResult,
  AgentConfig,
  PluginBase,
  UpdateAgentInput,
} from '@kombuse/types'
import { SELF_PLACEHOLDER, toSlug } from '@kombuse/types'
import {
  pluginsRepository,
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  profilesRepository,
  getDatabase,
} from '@kombuse/persistence'

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
      // Collect agent IDs BEFORE plugin delete (FK cascade nulls plugin_id)
      const oldAgents = db
        .prepare('SELECT id FROM agents WHERE plugin_id = ?')
        .all(existing.id) as { id: string }[]
      oldPluginAgentIds = new Set(oldAgents.map((a) => a.id))
      // Collect old labels for remap (labels survive plugin delete via ON DELETE SET NULL)
      const oldLabels = db
        .prepare('SELECT id, slug FROM labels WHERE plugin_id = ?')
        .all(existing.id) as { id: number; slug: string }[]
      oldLabelsBySlug = new Map(oldLabels.map((l) => [l.slug, l.id]))
      pluginsRepository.delete(existing.id)
    }

    // Step 3: Create plugin row
    const pluginId = crypto.randomUUID()
    pluginsRepository.create({
      id: pluginId,
      project_id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      directory: package_path,
      manifest: JSON.stringify(manifest),
    })

    const warnings: string[] = []
    let labelsCreated = 0
    let labelsMerged = 0
    let agentsCreated = 0
    let agentsUpdated = 0
    let triggersCreated = 0
    const importedAgentIds = new Set<string>()

    // Step 4: Import labels
    const labelNameToId = new Map<string, number>()

    // Preload existing project labels
    const existingLabels = labelsRepository.getByProject(project_id)
    for (const label of existingLabels) {
      labelNameToId.set(label.name, label.id)
    }

    if (manifest.kombuse?.labels) {
      for (const exportedLabel of manifest.kombuse.labels) {
        const slug = toSlug(exportedLabel.name)
        const existingLabel = labelsRepository.getBySlugAndPlugin(slug, project_id, pluginId)
          ?? existingLabels.find((l) => l.name === exportedLabel.name)

        if (existingLabel) {
          // Merge: link existing label to this plugin and ensure slug is set
          labelsRepository.update(existingLabel.id, { plugin_id: pluginId, slug })
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
          labelsCreated++
        }
      }
    }

    // Step 4b: Remap ticket-label associations from old labels to newly imported ones
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
        }
      }
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
          ?? agentsRepository.getBySlug(slug)

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

          // Replace triggers: delete old, create new
          const oldTriggers = agentTriggersRepository.listByAgent(agentId)
          for (const t of oldTriggers) {
            agentTriggersRepository.delete(t.id)
          }

          triggersCreated += this.importAgentTriggers(
            agentId, frontmatter.triggers, pluginId, project_id, labelNameToId
          )

          importedAgentIds.add(agentId)
          agentsUpdated++
        } else {
          // Check for a soft-deleted profile from a previous install
          const existingProfile = profilesRepository.getBySlug(slug)
          const agentId = existingProfile?.id ?? crypto.randomUUID()

          if (existingProfile) {
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
            plugin_base: pluginBase,
          })

          triggersCreated += this.importAgentTriggers(
            agentId, frontmatter.triggers, pluginId, project_id, labelNameToId
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
      warnings,
    }
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
    labelNameToId: Map<string, number>
  ): Record<string, unknown> | null {
    if (!conditions) return null

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'label_name' && typeof value === 'string') {
        const labelId = labelNameToId.get(value)
        if (labelId !== undefined) {
          result['label_id'] = labelId
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
    labelNameToId: Map<string, number>
  ): number {
    if (!triggers) return 0
    let count = 0
    for (const trigger of triggers) {
      const conditions = this.resolveLabelNames(trigger.conditions, labelNameToId)
      const resolvedConditions = this.resolveSelfPlaceholder(conditions, agentId)

      agentTriggersRepository.create({
        agent_id: agentId,
        event_type: trigger.event_type,
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
}

export const pluginImportService = new PluginImportService()
