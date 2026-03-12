'use client'

import { useState, useMemo, useCallback } from 'react'
import { Bot, Pencil, RotateCcw, Save, Plus, X, Shield, Wrench } from 'lucide-react'
import { useAgents, useAgentProfiles, useUpdateAgent } from '@/hooks/use-agents'
import { Badge } from '@/base/badge'
import { Button } from '@/base/button'
import { Checkbox } from '@/base/checkbox'
import { Input } from '@/base/input'
import { Label } from '@/base/label'
import { COMMON_TOOLS, getToolLabel } from '../permission-editor/permission-constants'
import type { Agent, AgentConfig } from '@kombuse/types'

interface AutoApprovedToolsTabProps {
  className?: string
  projectId?: string
}

/** Concrete tools for checkbox display (exclude wildcard patterns) */
const TOOL_CHECKBOXES = COMMON_TOOLS.filter((t) => !t.value.includes('*'))

function hasOverrides(agent: Agent): boolean {
  return (
    agent.config.auto_approved_tools_override !== undefined ||
    agent.config.auto_approved_bash_commands_override !== undefined
  )
}

function AutoApprovedToolsTab({ className, projectId }: AutoApprovedToolsTabProps) {
  const { data: agents, isLoading: agentsLoading, error: agentsError } = useAgents(projectId ? { project_id: projectId } : undefined)
  const { data: profiles, isLoading: profilesLoading } = useAgentProfiles()
  const updateAgent = useUpdateAgent()

  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [localTools, setLocalTools] = useState<string[]>([])
  const [localBashCommands, setLocalBashCommands] = useState<string[]>([])
  const [newBashCommand, setNewBashCommand] = useState('')
  const [newCustomTool, setNewCustomTool] = useState('')

  const isLoading = agentsLoading || profilesLoading

  const profileNameMap = useMemo(() => {
    if (!profiles) return new Map<string, string>()
    return new Map(profiles.map((p) => [p.id, p.name]))
  }, [profiles])

  const agentsWithPresets = useMemo(
    () => (agents ?? []).filter((a) => a.resolved_preset),
    [agents]
  )

  const startEditing = useCallback((agent: Agent) => {
    setEditingAgentId(agent.id)
    setLocalTools(
      agent.config.auto_approved_tools_override ?? agent.resolved_preset?.autoApprovedTools ?? []
    )
    setLocalBashCommands(
      agent.config.auto_approved_bash_commands_override ??
        agent.resolved_preset?.autoApprovedBashCommands ??
        []
    )
    setNewBashCommand('')
    setNewCustomTool('')
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingAgentId(null)
    setLocalTools([])
    setLocalBashCommands([])
    setNewBashCommand('')
    setNewCustomTool('')
  }, [])

  const handleSave = useCallback(
    (agent: Agent) => {
      const newConfig: AgentConfig = {
        ...agent.config,
        auto_approved_tools_override: localTools,
        auto_approved_bash_commands_override: localBashCommands,
      }
      updateAgent.mutate(
        { id: agent.id, input: { config: newConfig } },
        { onSuccess: () => cancelEditing() }
      )
    },
    [localTools, localBashCommands, updateAgent, cancelEditing]
  )

  const handleReset = useCallback(
    (agent: Agent) => {
      const newConfig = { ...agent.config }
      delete newConfig.auto_approved_tools_override
      delete newConfig.auto_approved_bash_commands_override
      updateAgent.mutate(
        { id: agent.id, input: { config: newConfig } },
        { onSuccess: () => cancelEditing() }
      )
    },
    [updateAgent, cancelEditing]
  )

  const toggleTool = useCallback(
    (tool: string) => {
      setLocalTools((prev) =>
        prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
      )
    },
    []
  )

  const addBashCommand = useCallback(() => {
    const cmd = newBashCommand.trim()
    if (cmd && !localBashCommands.includes(cmd)) {
      setLocalBashCommands((prev) => [...prev, cmd])
      setNewBashCommand('')
    }
  }, [newBashCommand, localBashCommands])

  const removeBashCommand = useCallback((cmd: string) => {
    setLocalBashCommands((prev) => prev.filter((c) => c !== cmd))
  }, [])

  const addCustomTool = useCallback(() => {
    const tool = newCustomTool.trim()
    if (tool && !localTools.includes(tool)) {
      setLocalTools((prev) => [...prev, tool])
      setNewCustomTool('')
    }
  }, [newCustomTool, localTools])

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading auto-approved tools...
      </div>
    )
  }

  if (agentsError) {
    return (
      <div className="text-center py-8 text-destructive">
        Error: {agentsError.message}
      </div>
    )
  }

  if (agentsWithPresets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Shield className="size-8 mb-2" />
        <p className="text-sm">No agents have auto-approved tools configured</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {agentsWithPresets.map((agent) => {
          const preset = agent.resolved_preset!
          const isEditing = editingAgentId === agent.id
          const isCustomized = hasOverrides(agent)

          // Tools that are in the agent's list but not in COMMON_TOOLS
          const knownToolValues: Set<string> = new Set(TOOL_CHECKBOXES.map((t) => t.value))
          const effectiveTools = isEditing
            ? localTools
            : preset.autoApprovedTools
          const customTools = effectiveTools.filter((t) => !knownToolValues.has(t))
          const effectiveBashCommands = isEditing
            ? localBashCommands
            : preset.autoApprovedBashCommands

          return (
            <section key={agent.id} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">
                  {profileNameMap.get(agent.id) ?? agent.slug ?? agent.id}
                </h3>
                {preset.type && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {preset.type}
                  </Badge>
                )}
                <Badge
                  variant={isCustomized ? 'default' : 'outline'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {isCustomized ? 'Customized' : 'Default'}
                </Badge>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    onClick={() => startEditing(agent)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  {/* Tool checkboxes */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">
                      Auto-Approved Tools
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {TOOL_CHECKBOXES.map((tool) => (
                        <label
                          key={tool.value}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={localTools.includes(tool.value)}
                            onCheckedChange={() => toggleTool(tool.value)}
                          />
                          <span className="truncate">{tool.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Custom tools */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">
                      Custom Tools
                    </Label>
                    {customTools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {customTools.map((tool) => (
                          <Badge
                            key={tool}
                            variant="outline"
                            className="text-xs font-normal gap-1 cursor-pointer"
                            onClick={() => toggleTool(tool)}
                          >
                            <Wrench className="size-3" />
                            {getToolLabel(tool)}
                            <X className="size-3" />
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newCustomTool}
                        onChange={(e) => setNewCustomTool(e.target.value)}
                        placeholder="Tool name (e.g. mcp__github__get_issue)"
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addCustomTool()
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addCustomTool}
                        disabled={!newCustomTool.trim()}
                      >
                        <Plus className="size-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Bash commands */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">
                      Auto-Approved Bash Command Prefixes
                    </Label>
                    {localBashCommands.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {localBashCommands.map((cmd) => (
                          <Badge
                            key={cmd}
                            variant="outline"
                            className="text-xs font-normal gap-1 cursor-pointer"
                            onClick={() => removeBashCommand(cmd)}
                          >
                            {cmd} *
                            <X className="size-3" />
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newBashCommand}
                        onChange={(e) => setNewBashCommand(e.target.value)}
                        placeholder="Command prefix (e.g. git status)"
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addBashCommand()
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addBashCommand}
                        disabled={!newBashCommand.trim()}
                      >
                        <Plus className="size-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      onClick={() => handleSave(agent)}
                      disabled={updateAgent.isPending}
                    >
                      <Save className="size-3.5 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
                    {isCustomized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReset(agent)}
                        disabled={updateAgent.isPending}
                        className="ml-auto"
                      >
                        <RotateCcw className="size-3.5 mr-1" />
                        Reset to Defaults
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                /* Read-only view */
                <div>
                  {effectiveTools.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {isCustomized ? 'Custom auto-approved tools' : `Auto-approved via ${preset.type ?? 'default'} preset`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveTools.map((tool) => (
                          <Badge
                            key={tool}
                            variant="outline"
                            className="text-xs font-normal gap-1"
                          >
                            <Wrench className="size-3" />
                            {getToolLabel(tool)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {effectiveBashCommands.length > 0 && (
                    <div className={effectiveTools.length > 0 ? 'mt-2' : ''}>
                      <p className="text-xs text-muted-foreground mb-2">
                        Auto-approved bash commands
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveBashCommands.map((cmd) => (
                          <Badge
                            key={`bash:${cmd}`}
                            variant="outline"
                            className="text-xs font-normal gap-1"
                          >
                            <Wrench className="size-3" />
                            Bash: {cmd} *
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {effectiveTools.length === 0 && effectiveBashCommands.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No tools auto-approved
                    </p>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export { AutoApprovedToolsTab }
export type { AutoApprovedToolsTabProps }
