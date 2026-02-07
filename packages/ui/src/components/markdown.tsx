import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { remarkTicketLinks } from './remark-ticket-links'
import { remarkProfileMentions } from './remark-profile-mentions'
import { TicketMentionChip } from './ticket-mention-chip'
import { cn } from '../lib/utils'
import type { PluggableList } from 'unified'

interface MarkdownProps {
  children: string
  className?: string
  projectId?: string | null
}

const TICKET_LINK_REGEX = /\/projects\/[^/]+\/tickets\/(\d+)$/

const components: Components = {
  a: ({ href, children: linkChildren, ...props }) => {
    if (href?.startsWith('mention://')) {
      return (
        <span className="font-medium text-primary">
          {linkChildren}
        </span>
      )
    }
    if (href?.startsWith('/projects/')) {
      const ticketMatch = href.match(TICKET_LINK_REGEX)
      if (ticketMatch) {
        return <TicketMentionChip ticketId={Number(ticketMatch[1])} href={href} />
      }
      return (
        <Link to={href} className={props.className}>
          {linkChildren}
        </Link>
      )
    }
    return (
      <a href={href} {...props}>
        {linkChildren}
      </a>
    )
  },
}

export function Markdown({ children, className, projectId }: MarkdownProps) {
  const remarkPlugins: PluggableList = [remarkGfm, remarkProfileMentions]
  if (projectId) {
    remarkPlugins.push([remarkTicketLinks, { projectId }])
  }

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none font-sans',
        'text-foreground prose-headings:text-foreground',
        'prose-headings:font-semibold',
        'prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:border',
        'prose-blockquote:text-muted-foreground prose-blockquote:border-border',
        'prose-img:rounded-md',
        'prose-table:border prose-th:border prose-th:px-3 prose-th:py-2 prose-td:border prose-td:px-3 prose-td:py-2',
        'prose-hr:border-border',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
