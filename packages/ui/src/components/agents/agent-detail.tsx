'use client'

import { useState, useEffect, useRef } from 'react'
import type { Agent, AgentTrigger, Permission, Profile, UpdateAgentInput, UpdateProfileInput } from '@kombuse/types'
import { X, Trash2, Save, Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../base/card'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Textarea } from '../../base/textarea'
import { PromptEditor } from '../prompt-editor'
import { AvatarPicker, getAvatarIcon } from './avatar-picker'
import { TriggerEditor, type TriggerFormData } from '../triggers'
import { PermissionEditor } from '../permission-editor'

interface AgentDetailProps {
  agent: Agent
  profile: Profile
  triggers?: AgentTrigger[]
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

  const [idCopied, setIdCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopyId = () => {
    void navigator.clipboard.writeText(agent.id).then(() => {
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
    JSON.stringify(permissions) !== JSON.stringify(agent.permissions)

  // Reset form when agent changes
  useEffect(() => {
    setName(profile.name)
    setDescription(profile.description || '')
    setAvatar(profile.avatar_url || 'bot')
    setSystemPrompt(agent.system_prompt)
    setPermissions(agent.permissions)
  }, [agent, profile])

  const handleSave = async () => {
    if (!onSave) return
    await onSave({
      profile: { name, description: description || undefined, avatar_url: avatar },
      agent: { system_prompt: systemPrompt, permissions },
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
                      {agent.id}
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

      <CardContent className="flex-1 overflow-y-auto space-y-6">
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
        <div className="space-y-2">
          <Label>System Prompt</Label>
          <PromptEditor
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="Enter the agent's system prompt..."
          />
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

        {/* Save Button */}
        {onSave && hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              <Save className="size-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { AgentDetail }
export type { AgentDetailProps }
