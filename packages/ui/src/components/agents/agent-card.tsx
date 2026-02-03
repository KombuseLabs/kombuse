'use client'

import type { Agent, Profile } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Card, CardContent } from '../../base/card'
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
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        isSelected && 'border-primary ring-1 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">{profile.name}</h3>
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
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {profile.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { AgentCard }
export type { AgentCardProps }
