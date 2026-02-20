'use client'

import type { Agent, Profile } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Switch } from '../../base/switch'
import { getAvatarIcon } from './avatar-picker'
import { Puzzle } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  profile: Profile
  isSelected?: boolean
  variant?: 'default' | 'card'
  pluginName?: string
  onClick?: () => void
  onToggle?: (enabled: boolean) => void
  isToggling?: boolean
}

function AgentCard({
  agent,
  profile,
  isSelected,
  variant = 'default',
  pluginName,
  onClick,
  onToggle,
  isToggling,
}: AgentCardProps) {
  const Icon = getAvatarIcon(profile.avatar_url)

  return (
    <div
      className={cn(
        variant === 'card'
          ? 'cursor-pointer rounded-xl px-3 py-3 transition-colors'
          : 'cursor-pointer border-l-2 border-l-transparent px-4 py-3 transition-colors',
        variant === 'card'
          ? (
            isSelected
              ? 'bg-accent/70 shadow-sm ring-1 ring-primary/35'
              : 'hover:bg-accent/35'
          )
          : (
            isSelected
              ? 'bg-accent border-l-primary'
              : 'hover:bg-accent/50'
          ),
        pluginName && !agent.is_enabled && 'opacity-50',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          isSelected ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted"
        )}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className={cn(
                'text-sm truncate',
                variant === 'card' && isSelected ? 'font-semibold' : 'font-medium',
              )}
              >
                {profile.name}
              </h3>
              <div className="flex items-center gap-2">
                <p className="font-mono text-[11px] text-muted-foreground/60 truncate">{agent.slug ?? agent.id}</p>
                {pluginName && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
                    <Puzzle className="size-3" />
                    {pluginName}
                  </span>
                )}
              </div>
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
