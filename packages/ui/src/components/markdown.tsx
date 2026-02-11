import { Children, isValidElement, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { remarkTicketLinks } from './remark-ticket-links'
import { remarkProfileMentions } from './remark-profile-mentions'
import { TicketMentionChip } from './ticket-mention-chip'
import { useShiki } from '../hooks/use-shiki'
import { cn } from '../lib/utils'
import type { PluggableList } from 'unified'

interface MarkdownProps {
  children: string
  className?: string
  projectId?: string | null
}

const TICKET_LINK_REGEX = /\/projects\/[^/]+\/tickets\/(\d+)$/

export function Markdown({ children, className, projectId }: MarkdownProps) {
  const { highlight } = useShiki()

  const remarkPlugins: PluggableList = [remarkGfm, remarkProfileMentions]
  if (projectId) {
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
  }), [highlight])

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none font-sans',
        // Ultra-light headings with tight tracking per design system
        'text-foreground prose-headings:text-foreground',
        'prose-headings:font-light prose-headings:tracking-tight',
        // Light body text for elegance
        'prose-p:text-foreground prose-p:font-light',
        'prose-li:text-foreground prose-li:font-light',
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
