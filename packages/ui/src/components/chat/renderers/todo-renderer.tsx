import type { SerializedAgentToolUseEvent } from '@kombuse/types'
import { Markdown } from '../../markdown'
import { useCurrentProject } from '../../../hooks/use-app-context'
import { formatEventTime } from './event-card'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

function todosToMarkdown(todos: TodoItem[]): string {
  return todos
    .map((todo) => {
      if (todo.status === 'completed') return `- [x] ${todo.content}`
      if (todo.status === 'in_progress') return `- [ ] **${todo.content}**`
      return `- [ ] ${todo.content}`
    })
    .join('\n')
}

export interface TodoRendererProps {
  toolUse: SerializedAgentToolUseEvent
}

export function TodoRenderer({ toolUse }: TodoRendererProps) {
  const { input, timestamp } = toolUse
  const { currentProjectId } = useCurrentProject()
  const todos = Array.isArray(input.todos) ? (input.todos as unknown as TodoItem[]) : []
  const markdown = todosToMarkdown(todos)

  return (
    <div className="rounded-lg bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">Update Todos</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatEventTime(timestamp)}
        </span>
      </div>
      <Markdown className="prose-sm text-xs" projectId={currentProjectId}>
        {markdown}
      </Markdown>
    </div>
  )
}
