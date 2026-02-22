'use client'

import { useMemo } from 'react'
import { Bot, Shield, Wrench } from 'lucide-react'
import { useAgents, useAgentProfiles } from '../../hooks/use-agents'
import { PermissionRuleList } from '../permission-editor/permission-rule-list'
import { Badge } from '../../base/badge'
import { getToolLabel } from '../permission-editor/permission-constants'

interface PermissionRulesTabProps {
  className?: string
  projectId?: string
}

function PermissionRulesTab({ className, projectId }: PermissionRulesTabProps) {
  const { data: agents, isLoading: agentsLoading, error: agentsError } = useAgents(projectId ? { project_id: projectId } : undefined)
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

  const agentsWithRules = (agents ?? []).filter(
    (agent) =>
      agent.permissions.length > 0 ||
      (agent.resolved_preset?.autoApprovedTools?.length ?? 0) > 0
  )

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
        {agentsWithRules.map((agent) => {
          const preset = agent.resolved_preset
          const autoApprovedTools = preset?.autoApprovedTools ?? []
          const autoApprovedBashCommands = preset?.autoApprovedBashCommands ?? []
          const hasExplicitRules = agent.permissions.length > 0
          const hasAutoApproved = autoApprovedTools.length > 0

          return (
            <section key={agent.id}>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">
                  {profileNameMap.get(agent.id) ?? agent.slug ?? agent.id}
                </h3>
                {preset?.type && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {preset.type}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  ({agent.permissions.length} rule{agent.permissions.length !== 1 ? 's' : ''})
                </span>
              </div>

              {hasExplicitRules && (
                <PermissionRuleList permissions={agent.permissions} />
              )}

              {hasAutoApproved && (
                <div className={hasExplicitRules ? 'mt-3' : ''}>
                  <p className="text-xs text-muted-foreground mb-2">
                    Auto-approved via <span className="font-medium">{preset?.type ?? 'default'}</span> preset
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {autoApprovedTools.map((tool) => (
                      <Badge key={tool} variant="outline" className="text-xs font-normal gap-1">
                        <Wrench className="size-3" />
                        {getToolLabel(tool)}
                      </Badge>
                    ))}
                    {autoApprovedBashCommands.map((cmd) => (
                      <Badge key={`bash:${cmd}`} variant="outline" className="text-xs font-normal gap-1">
                        <Wrench className="size-3" />
                        Bash: {cmd} *
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export { PermissionRulesTab }
export type { PermissionRulesTabProps }
