'use client'

import { useState, useEffect, useRef } from 'react'
import { BACKEND_TYPES, type Agent, type AgentConfig, type AgentTrigger, type BackendType, type Permission, type Profile, type UpdateAgentInput, type UpdateProfileInput } from '@kombuse/types'
import { X, Trash2, Save, Copy, Check, Puzzle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../base/card'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Switch } from '../../base/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../base/tabs'
import { Textarea } from '../../base/textarea'
import { PromptEditor } from '../prompt-editor'
import { AvatarPicker, getAvatarIcon } from './avatar-picker'
import { TriggerEditor, type TriggerFormData } from '../triggers'
import { PermissionEditor } from '../permission-editor'
import { ModelSelector } from '../model-selector'
import { useDefaultBackendType } from '../../hooks/use-app-context'
import { useAvailableBackends } from '../../hooks/use-available-backends'
import { backendLabel, normalizeBackendChoice, type BackendChoice } from '../../lib/backend-utils'

interface AgentDetailProps {
  agent: Agent
  profile: Profile
  triggers?: AgentTrigger[]
  pluginName?: string
  onClose?: () => void
  onSave?: (updates: {
    profile: UpdateProfileInput
    agent: UpdateAgentInput
  }) => Promise<void>
  onDelete?: () => void
  onCreateTrigger?: (data: TriggerFormData) => Promise<void>
  onUpdateTrigger?: (id: number, data: Partial<TriggerFormData>) => Promise<void>
  onDeleteTrigger?: (id: number) => Promise<void>
  onToggleTrigger?: (id: number, enabled: boolean) => Promise<void>
  isSaving?: boolean
  isDeleting?: boolean
  isCreatingTrigger?: boolean
  isUpdatingTrigger?: boolean
  deletingTriggerId?: number
  togglingTriggerId?: number
}

function AgentDetail({
  agent,
  profile,
  triggers = [],
  pluginName,
  onClose,
  onSave,
  onDelete,
  onCreateTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
  onToggleTrigger,
  isSaving,
  isDeleting,
  isCreatingTrigger,
  isUpdatingTrigger,
  deletingTriggerId,
  togglingTriggerId,
}: AgentDetailProps) {
  const [name, setName] = useState(profile.name)
  const [description, setDescription] = useState(profile.description || '')
  const [avatar, setAvatar] = useState(profile.avatar_url || 'bot')
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [permissions, setPermissions] = useState<Permission[]>(agent.permissions)
  const [enabledForChat, setEnabledForChat] = useState(agent.config?.enabled_for_chat ?? false)
  const [canInvokeAgents, setCanInvokeAgents] = useState(agent.config?.can_invoke_agents ?? true)
  const [backendChoice, setBackendChoice] = useState<BackendChoice>(
    normalizeBackendChoice(agent.config?.backend_type)
  )
  const [modelPreference, setModelPreference] = useState(
    typeof agent.config?.model === 'string' ? agent.config.model : ''
  )
  const [activeTab, setActiveTab] = useState('basic-info')
  const { defaultBackendType } = useDefaultBackendType()
  const { availableBackends, isAvailable, noneAvailable } = useAvailableBackends()
  const effectiveBackendForModels: BackendType | undefined =
    backendChoice === 'global' ? defaultBackendType : backendChoice

  const [idCopied, setIdCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopyId = () => {
    void navigator.clipboard.writeText(agent.slug ?? agent.id).then(() => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setIdCopied(true)
      copyTimeoutRef.current = setTimeout(() => setIdCopied(false), 1500)
    })
  }

  const hasChanges =
    name !== profile.name ||
    description !== (profile.description || '') ||
    avatar !== (profile.avatar_url || 'bot') ||
    systemPrompt !== agent.system_prompt ||
    JSON.stringify(permissions) !== JSON.stringify(agent.permissions) ||
    enabledForChat !== (agent.config?.enabled_for_chat ?? false) ||
    canInvokeAgents !== (agent.config?.can_invoke_agents ?? true) ||
    backendChoice !== normalizeBackendChoice(agent.config?.backend_type) ||
    modelPreference.trim() !== (typeof agent.config?.model === 'string' ? agent.config.model.trim() : '')

  // Reset form when agent changes
  useEffect(() => {
    setName(profile.name)
    setDescription(profile.description || '')
    setAvatar(profile.avatar_url || 'bot')
    setSystemPrompt(agent.system_prompt)
    setPermissions(agent.permissions)
    setEnabledForChat(agent.config?.enabled_for_chat ?? false)
    setCanInvokeAgents(agent.config?.can_invoke_agents ?? true)
    setBackendChoice(normalizeBackendChoice(agent.config?.backend_type))
    setModelPreference(typeof agent.config?.model === 'string' ? agent.config.model : '')
    setActiveTab('basic-info')
  }, [agent, profile])

  const handleSave = async () => {
    if (!onSave) return
    const nextConfig: AgentConfig = {
      ...agent.config,
      enabled_for_chat: enabledForChat,
      can_invoke_agents: canInvokeAgents,
    }
    if (backendChoice === 'global') {
      delete (nextConfig as Record<string, unknown>).backend_type
    } else {
      nextConfig.backend_type = backendChoice
    }

    const trimmedModelPreference = modelPreference.trim()
    if (trimmedModelPreference.length === 0) {
      delete (nextConfig as Record<string, unknown>).model
    } else {
      nextConfig.model = trimmedModelPreference
    }

    await onSave({
      profile: { name, description: description || undefined, avatar_url: avatar },
      agent: { system_prompt: systemPrompt, permissions, config: nextConfig },
    })
  }

  const Icon = getAvatarIcon(avatar)

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="size-6" />
            </div>
            <div>
              <CardTitle className="text-xl">{profile.name}</CardTitle>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    agent.is_enabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  )}
                >
                  {agent.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
                {pluginName && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Puzzle className="size-3" />
                    {pluginName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopyId}
                  title={`Click to copy: ${agent.id}`}
                  className="flex items-center gap-1 font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors cursor-pointer"
                >
                  {idCopied ? (
                    <>
                      <Check className="size-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      {agent.slug ?? agent.id}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

        <CardContent className="flex-1 min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent
              value="basic-info"
              forceMount
              hidden={activeTab !== 'basic-info'}
              data-testid="agent-basic-info-scroll"
              className="flex h-full min-h-0 flex-col pr-1 data-[state=inactive]:hidden"
            >
              <div className="flex h-full min-h-0 flex-col gap-6">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Name</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Agent name"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="agent-description">Description</Label>
                  <Textarea
                    id="agent-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this agent do?"
                    className="min-h-20"
                  />
                </div>

                {/* Avatar */}
                <div className="space-y-2">
                  <Label>Avatar</Label>
                  <AvatarPicker value={avatar} onChange={setAvatar} />
                </div>

                {/* System Prompt */}
                <div className="flex min-h-0 flex-1 flex-col space-y-2">
                  <Label>System Prompt</Label>
                  <PromptEditor
                    value={systemPrompt}
                    onChange={setSystemPrompt}
                    placeholder="Enter the agent's system prompt..."
                    showAvailableVariables
                    fillHeight
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="configuration"
              forceMount
              hidden={activeTab !== 'configuration'}
              className="min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden"
            >
              <div className="space-y-6">
                {/* Available in chat */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enabled-for-chat">Available in chat</Label>
                    <p className="text-xs text-muted-foreground">Show this agent in the chat agent picker</p>
                  </div>
                  <Switch
                    id="enabled-for-chat"
                    checked={enabledForChat}
                    onCheckedChange={setEnabledForChat}
                  />
                </div>

                {/* Can invoke other agents */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="can-invoke-agents">Can invoke other agents</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow this agent to trigger other agents via @-mentions
                    </p>
                  </div>
                  <Switch
                    id="can-invoke-agents"
                    checked={canInvokeAgents}
                    onCheckedChange={setCanInvokeAgents}
                  />
                </div>

                {/* Execution Preferences */}
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="agent-backend-override">Backend Override</Label>
                    <select
                      id="agent-backend-override"
                      value={backendChoice}
                      onChange={(event) => setBackendChoice(event.target.value as BackendChoice)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="global">Use global default</option>
                      {noneAvailable ? (
                        <option value="" disabled>No backends available</option>
                      ) : (
                        availableBackends.map((bt) => (
                          <option key={bt} value={bt}>{backendLabel(bt)}</option>
                        ))
                      )}
                      {backendChoice !== 'global' && backendChoice !== BACKEND_TYPES.MOCK && !isAvailable(backendChoice) && !noneAvailable && (
                        <option value={backendChoice} disabled>
                          {backendLabel(backendChoice)} (not installed)
                        </option>
                      )}
                      {backendChoice === BACKEND_TYPES.MOCK ? (
                        <option value={BACKEND_TYPES.MOCK}>Mock</option>
                      ) : null}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-model-override">Model Override</Label>
                    <ModelSelector
                      id="agent-model-override"
                      backendType={effectiveBackendForModels}
                      value={modelPreference}
                      onChange={setModelPreference}
                      showDefaultHint={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Stored as a preference and applied when the selected backend supports explicit model selection.
                    </p>
                  </div>
                </div>

                {/* Permissions */}
                <div className="pt-4 border-t">
                  <PermissionEditor permissions={permissions} onChange={setPermissions} />
                </div>

                {/* Triggers */}
                {onCreateTrigger && onUpdateTrigger && onDeleteTrigger && onToggleTrigger && (
                  <div className="pt-4 border-t">
                    <TriggerEditor
                      agentId={agent.id}
                      triggers={triggers}
                      onCreateTrigger={onCreateTrigger}
                      onUpdateTrigger={onUpdateTrigger}
                      onDeleteTrigger={onDeleteTrigger}
                      onToggleTrigger={onToggleTrigger}
                      isCreating={isCreatingTrigger}
                      isUpdating={isUpdatingTrigger}
                      deletingId={deletingTriggerId}
                      togglingId={togglingTriggerId}
                    />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="shrink-0 justify-end border-t">
          {onSave && hasChanges && (
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              <Save className="size-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

export { AgentDetail }
export type { AgentDetailProps }
