import { Children, isValidElement, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { remarkTicketLinks } from './remark-ticket-links'
import { remarkProfileMentions } from './remark-profile-mentions'
import { remarkLabelMentions } from './remark-label-mentions'
import { remarkCommentLinks } from './remark-comment-links'
import { TicketMentionChip } from './ticket-mention-chip'
import { LabelMentionChip } from './label-mention-chip'
import { CommentMentionChip } from './comment-mention-chip'
import { useShiki } from '../hooks/use-shiki'
import { cn } from '../lib/utils'
import type { PluggableList } from 'unified'

interface MarkdownProps {
  children: string
  className?: string
  projectId?: string | null
}

const TICKET_LINK_REGEX = /\/projects\/[^/]+\/tickets\/(\d+)$/
const LABEL_PROTOCOL_REGEX = /^label:\/\/(\d+)$/
const COMMENT_PROTOCOL_REGEX = /^comment:\/\/(\d+)\/(\d+)$/

export function Markdown({ children, className, projectId }: MarkdownProps) {
  const { highlight } = useShiki()

  const remarkPlugins: PluggableList = [remarkGfm, remarkProfileMentions]
  if (projectId) {
    remarkPlugins.push(remarkLabelMentions)
    remarkPlugins.push(remarkCommentLinks)
    remarkPlugins.push([remarkTicketLinks, { projectId }])
  }

  const components = useMemo<Components>(() => ({
    code: ({ children, className, ...rest }) => {
      const langMatch = (className || '').match(/language-(\w+)/)
      if (langMatch) {
        const lang = langMatch[1] ?? ''
        const code = String(children ?? '').replace(/\n$/, '')
        const html = highlight(code, lang)
        if (html) {
          return <div dangerouslySetInnerHTML={{ __html: html }} />
        }
      }
      return <code className={className} {...rest}>{children}</code>
    },
    pre: ({ children }) => {
      const child = Children.toArray(children)[0]
      if (isValidElement(child) && child.type === 'div') {
        return <>{children}</>
      }
      return <pre>{children}</pre>
    },
    a: ({ href, children: linkChildren, ...props }) => {
      if (href?.startsWith('mention://')) {
        return (
          <span className="font-medium text-primary">
            {linkChildren}
          </span>
        )
      }
      if (href?.startsWith('label://') && projectId) {
        const labelMatch = href.match(LABEL_PROTOCOL_REGEX)
        if (labelMatch) {
          const labelName = typeof linkChildren === 'string'
            ? linkChildren
            : Array.isArray(linkChildren)
              ? linkChildren.join('')
              : String(linkChildren ?? '')
          return <LabelMentionChip labelId={Number(labelMatch[1])} labelName={labelName} projectId={projectId} />
        }
      }
      if (href?.startsWith('comment://') && projectId) {
        const commentMatch = href.match(COMMENT_PROTOCOL_REGEX)
        if (commentMatch) {
          return <CommentMentionChip ticketId={Number(commentMatch[1])} commentId={Number(commentMatch[2])} projectId={projectId} />
        }
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
  }), [highlight, projectId])

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none font-sans',
        // Compact headings with tight tracking per design system
        'text-foreground prose-headings:text-foreground',
        'prose-headings:font-light prose-headings:tracking-tight',
        'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-sm',
        // Body text at normal weight for readability
        'prose-p:text-foreground',
        'prose-li:text-foreground',
        'prose-strong:text-foreground prose-strong:font-medium',
        // Links
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        // Inline code
        'prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0',
        // Blockquotes
        'prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-blockquote:font-light prose-blockquote:not-italic',
        // Media & tables
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
