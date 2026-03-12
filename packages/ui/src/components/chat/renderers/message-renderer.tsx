import type { SerializedAgentMessageEvent } from '@kombuse/types'
import { Bot, Info, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '@/hooks/use-app-context'
import { EventCard } from './event-card'
import { ChatImageGallery } from './chat-image-gallery'

export interface MessageRendererProps {
  event: SerializedAgentMessageEvent
}

const roleIcon = {
  user: <User className="size-3.5" />,
  assistant: <Bot className="size-3.5" />,
  system: <Info className="size-3.5" />,
} as const

export function MessageRenderer({ event }: MessageRendererProps) {
  const { role, content, images, timestamp } = event
  const { currentProjectId } = useCurrentProject()
  const hasText = content.trim().length > 0
  const hasImages = images && images.length > 0

  return (
    <EventCard
      timestamp={timestamp}
      className={cn(
        'p-4 border-l-2',
        role === 'user' && 'bg-primary/5 border-l-primary',
        role === 'assistant' && 'bg-muted/60 border-l-muted-foreground/20',
        role === 'system' && 'bg-muted/30 border-l-muted-foreground/10 italic'
      )}
      header={
        <span className="text-muted-foreground/60">
          {roleIcon[role] ?? roleIcon.system}
        </span>
      }
    >
      {hasText && <Markdown projectId={currentProjectId}>{content}</Markdown>}
      {hasImages && <ChatImageGallery images={images} />}
    </EventCard>
  )
}
