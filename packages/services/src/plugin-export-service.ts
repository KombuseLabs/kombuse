import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import type {
  Agent,
  AgentTrigger,
  Profile,
  AgentExportFrontmatter,
  ExportedTrigger,
  AgentExportFile,
  AgentExportResult,
} from '@kombuse/types'
import { SELF_PLACEHOLDER, ANONYMOUS_AGENT_ID } from '@kombuse/types'
import {
  agentsRepository,
  agentTriggersRepository,
  profilesRepository,
} from '@kombuse/persistence'

export interface IAgentExportService {
  serializeAll(): AgentExportFile[]
  serializeOne(agentId: string): AgentExportFile | null
  serializeMany(agentIds: string[]): AgentExportFile[]
  writeToDirectory(directory: string, agentIds?: string[]): AgentExportResult
}

/** Well-known config keys that are promoted to top-level frontmatter fields. */
const PROMOTED_CONFIG_KEYS = ['type', 'model', 'backend_type', 'enabled_for_chat']

export class AgentExportService implements IAgentExportService {
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

  writeToDirectory(directory: string, agentIds?: string[]): AgentExportResult {
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

export const agentExportService = new AgentExportService()
