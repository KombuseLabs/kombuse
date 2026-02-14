import { useState } from 'react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../base/hover-card'
import { AgentPreviewCard } from './agent-preview-card'

interface AgentHoverCardProps {
  agentId: string
  children: React.ReactNode
}

function AgentHoverCard({ agentId, children }: AgentHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)

  if (hasLoadError) {
    return <>{children}</>
  }

  return (
    <HoverCard
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen)
        if (nextOpen && !shouldLoad) {
          setShouldLoad(true)
        }
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-96">
        <AgentPreviewCard
          agentId={agentId}
          enabled={shouldLoad}
          onError={() => setHasLoadError(true)}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

export { AgentHoverCard }
export type { AgentHoverCardProps }
