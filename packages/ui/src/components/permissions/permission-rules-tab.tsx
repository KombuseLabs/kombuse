'use client'

import { useMemo } from 'react'
import { Bot, Shield } from 'lucide-react'
import { useAgents, useAgentProfiles } from '../../hooks/use-agents'
import { PermissionRuleList } from '../permission-editor/permission-rule-list'

interface PermissionRulesTabProps {
  className?: string
}

function PermissionRulesTab({ className }: PermissionRulesTabProps) {
  const { data: agents, isLoading: agentsLoading, error: agentsError } = useAgents()
  const { data: profiles, isLoading: profilesLoading } = useAgentProfiles()

  const isLoading = agentsLoading || profilesLoading

  const profileNameMap = useMemo(() => {
    if (!profiles) return new Map<string, string>()
    return new Map(profiles.map((p) => [p.id, p.name]))
  }, [profiles])

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading permission rules...
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

  const agentsWithRules = (agents ?? []).filter((agent) => agent.permissions.length > 0)

  if (agentsWithRules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Shield className="size-8 mb-2" />
        <p className="text-sm">No agents have permission rules configured</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {agentsWithRules.map((agent) => (
          <section key={agent.id}>
            <div className="flex items-center gap-2 mb-3">
              <Bot className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">
                {profileNameMap.get(agent.id) ?? agent.slug ?? agent.id}
              </h3>
              <span className="text-xs text-muted-foreground">
                ({agent.permissions.length} rule{agent.permissions.length !== 1 ? 's' : ''})
              </span>
            </div>
            <PermissionRuleList permissions={agent.permissions} />
          </section>
        ))}
      </div>
    </div>
  )
}

export { PermissionRulesTab }
export type { PermissionRulesTabProps }
