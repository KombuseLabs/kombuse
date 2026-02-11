import { Link } from 'react-router-dom'
import { useComment } from '../hooks/use-comments'
import { cn } from '../lib/utils'

interface CommentMentionChipProps {
  ticketId: number
  commentId: number
  projectId: string
}

export function CommentMentionChip({ ticketId, commentId, projectId }: CommentMentionChipProps) {
  const href = `/projects/${projectId}/tickets/${ticketId}#comment-${commentId}`
  const { data: comment, isLoading, isError } = useComment(commentId)

  if (isLoading || isError || !comment) {
    return (
      <Link to={href} className="text-primary no-underline hover:underline">
        #{ticketId}/c/{commentId}
      </Link>
    )
  }

  return (
    <Link
      to={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5',
        'bg-muted/50 text-sm no-underline hover:bg-muted transition-colors',
        'align-baseline'
      )}
    >
      <span className="font-mono text-xs text-muted-foreground">#{ticketId}/c/{commentId}</span>
      <span className="max-w-[150px] truncate text-foreground">{comment.author.name}</span>
    </Link>
  )
}
