'use client'

import { useState, useEffect } from 'react'
import type { Agent, Profile, UpdateAgentInput, UpdateProfileInput } from '@kombuse/types'
import { X, Trash2, Save } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../base/card'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Textarea } from '../../base/textarea'
import { PromptEditor } from '../prompt-editor'
import { AvatarPicker, getAvatarIcon } from './avatar-picker'

interface AgentDetailProps {
  agent: Agent
  profile: Profile
  onClose?: () => void
  onSave?: (updates: {
    profile: UpdateProfileInput
    agent: UpdateAgentInput
  }) => Promise<void>
  onDelete?: () => void
  isSaving?: boolean
  isDeleting?: boolean
}

function AgentDetail({
  agent,
  profile,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: AgentDetailProps) {
  const [name, setName] = useState(profile.name)
  const [description, setDescription] = useState(profile.description || '')
  const [avatar, setAvatar] = useState(profile.avatar_url || 'bot')
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)

  const hasChanges =
    name !== profile.name ||
    description !== (profile.description || '') ||
    avatar !== (profile.avatar_url || 'bot') ||
    systemPrompt !== agent.system_prompt

  // Reset form when agent changes
  useEffect(() => {
    setName(profile.name)
    setDescription(profile.description || '')
    setAvatar(profile.avatar_url || 'bot')
    setSystemPrompt(agent.system_prompt)
  }, [agent, profile])

  const handleSave = async () => {
    if (!onSave) return
    await onSave({
      profile: { name, description: description || undefined, avatar_url: avatar },
      agent: { system_prompt: systemPrompt },
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
