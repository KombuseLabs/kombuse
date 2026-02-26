import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pack } from '@kombuse/pkg'
import * as yaml from 'js-yaml'
import type {
  Agent,
  AgentTrigger,
  Label,
  Profile,
  AgentExportFrontmatter,
  ExportedTrigger,
  AgentExportFile,
  AgentExportResult,
  KombusePluginManifest,
  PluginExportInput,
  PluginExportResult,
  ExportedLabel,
  PkgManifest,
} from '@kombuse/types'
import { SELF_PLACEHOLDER, ANONYMOUS_AGENT_ID } from '@kombuse/types'
import {
  agentsRepository,
  agentTriggersRepository,
  labelsRepository,
  pluginFilesRepository,
  pluginsRepository,
  profilesRepository,
  projectsRepository,
} from '@kombuse/persistence'

const PACKAGE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

export class PackageExistsError extends Error {
  public readonly directory: string

  constructor(directory: string) {
    super(`Package directory already exists: ${directory}`)
    this.name = 'PackageExistsError'
    this.directory = directory
  }
}

export interface IPluginExportService {
  serializeAll(): AgentExportFile[]
  serializeOne(agentId: string): AgentExportFile | null
  serializeMany(agentIds: string[]): AgentExportFile[]
  writeAgentsToDirectory(directory: string, agentIds?: string[]): AgentExportResult
  exportPackage(input: PluginExportInput): Promise<PluginExportResult>
}

/** Well-known config keys that are promoted to top-level frontmatter fields. */
const PROMOTED_CONFIG_KEYS = ['type', 'model', 'backend_type', 'enabled_for_chat']

export class PluginExportService implements IPluginExportService {
  serializeAll(): AgentExportFile[] {
    const agents = agentsRepository.list({ limit: Number.MAX_SAFE_INTEGER })
    const files: AgentExportFile[] = []

    for (const agent of agents) {
      if (agent.id === ANONYMOUS_AGENT_ID) continue
      const file = this.buildExportFile(agent)
      if (file) files.push(file)
    }

    files.sort((a, b) => a.filename.localeCompare(b.filename))
    return files
  }

  serializeOne(agentId: string): AgentExportFile | null {
    const agent = agentsRepository.get(agentId)
    if (!agent || agent.id === ANONYMOUS_AGENT_ID) return null
    return this.buildExportFile(agent)
  }

  serializeMany(agentIds: string[]): AgentExportFile[] {
    const files: AgentExportFile[] = []
    for (const agentId of agentIds) {
      const file = this.serializeOne(agentId)
      if (file) files.push(file)
    }
    files.sort((a, b) => a.filename.localeCompare(b.filename))
    return files
  }

  writeAgentsToDirectory(directory: string, agentIds?: string[]): AgentExportResult {
    const files = agentIds && agentIds.length > 0
      ? this.serializeMany(agentIds)
      : this.serializeAll()

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }

    for (const file of files) {
      writeFileSync(join(directory, file.filename), file.content, 'utf-8')
    }

    return {
      directory,
      count: files.length,
      files: files.map((f) => f.filename),
    }
  }

  async exportPackage(input: PluginExportInput): Promise<PluginExportResult> {
    const { package_name, project_id, author, version, agent_ids, description, overwrite } = input

    if (!PACKAGE_NAME_REGEX.test(package_name)) {
      throw new Error(`Invalid package name "${package_name}". Must be lowercase kebab-case (e.g. "my-plugin").`)
    }

    // Resolve base path from project's local_path, fall back to process.cwd()
    const project = projectsRepository.get(project_id)
    const basePath = project?.local_path ?? process.cwd()
    const directory = join(basePath, '.kombuse', 'plugins', package_name)

    if (existsSync(directory) && !overwrite) {
      throw new PackageExistsError(directory)
    }

    // Serialize agents
    const agentFiles = agent_ids && agent_ids.length > 0
      ? this.serializeMany(agent_ids)
      : this.serializeAll()

    // Fetch all project labels
    const projectLabels = labelsRepository.getByProject(project_id)
    const labelsMap = new Map<number, Label>()
    for (const label of projectLabels) {
      labelsMap.set(label.id, label)
    }

    // Replace label_id with label_name in agent files
    const processedFiles = agentFiles.map((file) =>
      this.replaceLabelIdsInFile(file, labelsMap)
    )

    // Build exported labels
    const exportedLabels: ExportedLabel[] = projectLabels.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
    }))

    // Build manifest
    const resolvedVersion = version ?? '1.0.0'
    const manifest: KombusePluginManifest = {
      name: package_name,
      version: resolvedVersion,
      ...(author ? { author } : {}),
      ...(description ? { description } : {}),
      kombuse: {
        plugin_system_version: 'kombuse-plugin-v1',
        exported_at: new Date().toISOString(),
        labels: exportedLabels,
      },
    }

    // Write directory structure
    if (existsSync(directory) && overwrite) {
      rmSync(directory, { recursive: true })
    }

    const agentsDir = join(directory, 'agents')
    const pluginMetaDir = join(directory, '.kombuse-plugin')
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(pluginMetaDir, { recursive: true })

    // Write manifest
    const manifestPath = join(pluginMetaDir, 'plugin.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    // Write PkgManifest at plugin root for @kombuse/pkg discovery
    const pkgManifest: PkgManifest = {
      name: package_name,
      version: resolvedVersion,
      type: 'plugin',
      ...(author ? { author } : {}),
      ...(description ? { description } : {}),
      metadata: {
        plugin_system_version: 'kombuse-plugin-v1',
        label_count: exportedLabels.length,
        agent_count: processedFiles.length,
      },
    }
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(pkgManifest, null, 2), 'utf-8')

    // Write agent files
    const writtenFiles: string[] = ['manifest.json', '.kombuse-plugin/plugin.json']
    for (const file of processedFiles) {
      writeFileSync(join(agentsDir, file.filename), file.content, 'utf-8')
      writtenFiles.push(`agents/${file.filename}`)
    }

    // Write plugin files from DB
    let pluginFileCount = 0
    const plugin = pluginsRepository.getByName(project_id, package_name)
    if (plugin) {
      const pluginFiles = pluginFilesRepository.list(plugin.id)
      for (const pf of pluginFiles) {
        const filePath = join(directory, 'files', pf.path)
        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, pf.content, 'utf-8')
        writtenFiles.push(`files/${pf.path}`)
        pluginFileCount++
      }
    }

    // Optionally create archive
    let archive: PluginExportResult['archive']
    if (input.archive_format === 'tar.gz') {
      const archivePath = `${directory}.tar.gz`
      const packResult = await pack({
        sourceDir: directory,
        outputPath: archivePath,
      })
      archive = {
        path: packResult.archivePath,
        checksum: packResult.checksum,
        size: packResult.size,
      }
    }

    return {
      package_name,
      directory,
      agent_count: processedFiles.length,
      label_count: exportedLabels.length,
      file_count: pluginFileCount,
      files: writtenFiles,
      ...(archive ? { archive } : {}),
    }
  }

  private replaceLabelIdsInFile(file: AgentExportFile, labelsMap: Map<number, Label>): AgentExportFile {
    if (labelsMap.size === 0) return file

    let content = file.content
    for (const [labelId, label] of labelsMap) {
      content = content.replaceAll(`label_id: ${labelId}`, `label_name: "${label.name}"`)
    }

    return { filename: file.filename, content }
  }

  private buildExportFile(agent: Agent): AgentExportFile | null {
    const profile = profilesRepository.get(agent.id)
    if (!profile) return null

    const triggers = agentTriggersRepository.listByAgent(agent.id)
    const frontmatter = this.buildFrontmatter(agent, profile, triggers)
    const content = this.renderMarkdown(frontmatter, agent.system_prompt)

    return {
      filename: `${agent.slug ?? agent.id}.md`,
      content,
    }
  }

  private buildFrontmatter(
    agent: Agent,
    profile: Profile,
    triggers: AgentTrigger[]
  ): AgentExportFrontmatter {
    const config = agent.config as Record<string, unknown>

    const remainingConfig: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      if (!PROMOTED_CONFIG_KEYS.includes(key) && value !== undefined) {
        remainingConfig[key] = value
      }
    }

    const exportedTriggers = triggers.map((t) =>
      this.exportTrigger(t, agent.id)
    )

    return {
      name: profile.name,
      slug: agent.slug,
      description: profile.description,
      avatar: profile.avatar_url,
      type: (config.type as string) ?? 'kombuse',
      model: (config.model as string) ?? null,
      backend_type: (config.backend_type as string) ?? null,
      is_enabled: agent.is_enabled,
      enabled_for_chat: (config.enabled_for_chat as boolean) ?? false,
      permissions: agent.permissions,
      triggers: exportedTriggers,
      ...(Object.keys(remainingConfig).length > 0
        ? { config: remainingConfig }
        : {}),
    }
  }

  private exportTrigger(trigger: AgentTrigger, agentId: string): ExportedTrigger {
    return {
      slug: trigger.slug ?? undefined,
      event_type: trigger.event_type,
      conditions: this.applySelfPlaceholder(trigger.conditions, agentId),
      project_id: trigger.project_id,
      is_enabled: trigger.is_enabled,
      priority: trigger.priority,
    }
  }

  private applySelfPlaceholder(
    conditions: Record<string, unknown> | null,
    agentId: string
  ): Record<string, unknown> | null {
    if (!conditions) return null

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(conditions)) {
      result[key] = value === agentId ? SELF_PLACEHOLDER : value
    }
    return result
  }

  private renderMarkdown(
    frontmatter: AgentExportFrontmatter,
    systemPrompt: string
  ): string {
    const yamlStr = yaml.dump(frontmatter, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      sortKeys: false,
    })

    return `---\n${yamlStr}---\n\n${systemPrompt}\n`
  }
}

export const pluginExportService = new PluginExportService()
