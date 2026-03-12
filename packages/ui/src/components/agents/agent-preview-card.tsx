import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Permission } from '@kombuse/types'
import { Badge } from '@/base/badge'
import { cn } from '@/lib/utils'
import { useAgentWithProfile } from '@/hooks/use-agents'
import { useTriggers } from '@/hooks/use-triggers'
import { useCurrentProject } from '@/hooks/use-app-context'
import { getAvatarIcon } from './avatar-picker'

interface AgentPreviewCardProps {
  agentId: string
  enabled?: boolean
  onError?: () => void
}

function summarizePermissions(permissions: Permission[]) {
  const resourcePermissions = new Map<string, Set<string>>()
  let toolPermissionsCount = 0

  permissions.forEach((permission) => {
    if (permission.type === 'resource') {
      if (!resourcePermissions.has(permission.resource)) {
        resourcePermissions.set(permission.resource, new Set())
      }
      permission.actions.forEach((action) => {
        resourcePermissions.get(permission.resource)?.add(action)
      })
      return
    }

    toolPermissionsCount += 1
  })

  const resourceSummaries = Array.from(resourcePermissions.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, actions]) => `${resource}: ${Array.from(actions).join(', ')}`)

  return {
    resourceSummaries,
    toolPermissionsCount,
  }
}

function AgentPreviewSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading agent preview">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-md bg-muted animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 w-14 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-40 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
    </div>
  )
}

function AgentPreviewCard({ agentId, enabled = true, onError }: AgentPreviewCardProps) {
  const { currentProjectId } = useCurrentProject()
  const queryAgentId = enabled ? agentId : ''
  const { data: agentData, isLoading: isLoadingAgent, isError: isAgentError } = useAgentWithProfile(queryAgentId)
  const { data: triggers = [], isLoading: isLoadingTriggers, isError: isTriggersError } = useTriggers(queryAgentId)

  const isLoading = isLoadingAgent || isLoadingTriggers
  const hasError = isAgentError || isTriggersError

  useEffect(() => {
    if (enabled && hasError) {
      onError?.()
    }
  }, [enabled, hasError, onError])

  if (!enabled) {
    return null
  }

  if (isLoading) {
    return <AgentPreviewSkeleton />
  }

  if (hasError || !agentData) {
    return null
  }

  const { agent, profile } = agentData
  const Icon = getAvatarIcon(profile.avatar_url)
  const { resourceSummaries, toolPermissionsCount } = summarizePermissions(agent.permissions)
  const hasPermissions = resourceSummaries.length > 0 || toolPermissionsCount > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{profile.name}</p>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 mt-0.5',
              agent.is_enabled
                ? 'border-green-200 text-green-700 bg-green-50 dark:border-green-900 dark:text-green-300 dark:bg-green-950'
                : 'border-gray-300 text-muted-foreground bg-muted'
            )}
          >
            {agent.is_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </div>

      {agent.config?.model && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model</p>
          <p className="font-mono text-xs break-all">{agent.config.model}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Triggers</p>
        {triggers.length > 0 ? (
          <ul className="space-y-1">
            {triggers.map((trigger) => (
              <li key={trigger.id} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'size-1.5 rounded-full shrink-0',
                    trigger.is_enabled ? 'bg-green-500' : 'bg-muted-foreground/40'
                  )}
                />
                <span className="font-mono truncate">{trigger.event_type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">No triggers</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Permissions</p>
        {hasPermissions ? (
          <div className="space-y-1">
            {resourceSummaries.map((summary) => (
              <p key={summary} className="text-xs break-words">
                {summary}
              </p>
            ))}
            {toolPermissionsCount > 0 && (
              <p className="text-xs">
                {toolPermissionsCount} tool permission{toolPermissionsCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No permissions</p>
        )}
      </div>

      {currentProjectId && (
        <div>
          <Link
            to={`/projects/${currentProjectId}/agents/${agentId}`}
            className="text-xs text-primary no-underline hover:underline"
          >
            View full details
          </Link>
        </div>
      )}
    </div>
  )
}

export { AgentPreviewCard }
export type { AgentPreviewCardProps }
