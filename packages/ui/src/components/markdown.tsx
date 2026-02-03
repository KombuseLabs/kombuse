import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'

interface MarkdownProps {
  children: string
  className?: string
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose max-w-none',
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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
