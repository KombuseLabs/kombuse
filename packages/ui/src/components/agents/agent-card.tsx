'use client'

import type { Agent, Profile } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Switch } from '../../base/switch'
import { getAvatarIcon } from './avatar-picker'

interface AgentCardProps {
  agent: Agent
  profile: Profile
  isSelected?: boolean
  onClick?: () => void
  onToggle?: (enabled: boolean) => void
  isToggling?: boolean
}

function AgentCard({
  agent,
  profile,
  isSelected,
  onClick,
  onToggle,
  isToggling,
}: AgentCardProps) {
  const Icon = getAvatarIcon(profile.avatar_url)

  return (
    <div
      className={cn(
        'px-4 py-3 cursor-pointer transition-colors border-l-2 border-l-transparent',
        isSelected
          ? 'bg-accent border-l-primary'
          : 'hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium truncate">{profile.name}</h3>
              <p className="font-mono text-[11px] text-muted-foreground/60 truncate">{agent.id}</p>
            </div>
            <Switch
              checked={agent.is_enabled}
              onCheckedChange={(checked) => {
                onToggle?.(checked)
              }}
              onClick={(e) => e.stopPropagation()}
              disabled={isToggling}
            />
          </div>
          {profile.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {profile.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export { AgentCard }
export type { AgentCardProps }
