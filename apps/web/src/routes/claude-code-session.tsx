import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '@kombuse/ui/base'
import {
  useClaudeCodeProjects,
  useClaudeCodeSessions,
  useClaudeCodeSessionContent,
} from '@kombuse/ui/hooks'
import { cn } from '@kombuse/ui/lib/utils'
import type { ClaudeCodeSessionEntry } from '@kombuse/ui/lib/api'

export function ClaudeCodeSessionViewer() {
  const { projectPath, sessionId } = useParams<{ projectPath: string; sessionId: string }>()
  const decodedPath = projectPath ? decodeURIComponent(projectPath) : ''

  if (decodedPath && sessionId) {
    return <SessionContent projectPath={decodedPath} sessionId={sessionId} />
  }

  if (decodedPath) {
    return <SessionList projectPath={decodedPath} />
  }

  return <ProjectPicker />
}

function ProjectPicker() {
  const navigate = useNavigate()
  const { data: projects, isLoading, error } = useClaudeCodeProjects()

  if (isLoading) {
    return <PageShell title="Claude Code Sessions"><Loading /></PageShell>
  }

  if (error) {
    return <PageShell title="Claude Code Sessions"><ErrorMessage error={error} /></PageShell>
  }

  return (
    <PageShell title="Claude Code Sessions" subtitle="Select a project">
      <div className="space-y-2">
        {projects?.map((project) => (
          <button
            key={project.path}
            onClick={() => navigate(`/claude-code/${encodeURIComponent(project.path)}`)}
            className="flex w-full items-center justify-between rounded-md border bg-card px-4 py-3 text-left text-sm hover:bg-muted/50"
          >
            <div>
              <div className="font-medium">{project.name}</div>
              <div className="text-xs text-muted-foreground">{project.path}</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{project.totalSessions} sessions</span>
              {project.gitBranch && <Badge variant="outline">{project.gitBranch}</Badge>}
            </div>
          </button>
        ))}
        {projects?.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No Claude Code projects found in ~/.claude/projects/
          </div>
        )}
      </div>
    </PageShell>
  )
}

function SessionList({ projectPath }: { projectPath: string }) {
  const navigate = useNavigate()
  const { data: sessions, isLoading, error } = useClaudeCodeSessions(projectPath)
  const projectName = projectPath.split('/').pop() || projectPath

  if (isLoading) {
    return <PageShell title={projectName} backTo="/claude-code"><Loading /></PageShell>
  }

  if (error) {
    return <PageShell title={projectName} backTo="/claude-code"><ErrorMessage error={error} /></PageShell>
  }

  return (
    <PageShell title={projectName} subtitle={`${sessions?.length ?? 0} sessions`} backTo="/claude-code">
      <div className="space-y-2">
        {sessions?.map((session: ClaudeCodeSessionEntry) => (
          <button
            key={session.sessionId}
            onClick={() => navigate(`/claude-code/${encodeURIComponent(projectPath)}/sessions/${session.sessionId}`)}
            className="flex w-full items-center justify-between rounded-md border bg-card px-4 py-3 text-left text-sm hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {session.firstPrompt || session.sessionId}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(session.modified).toLocaleString()} · {session.messageCount} messages
              </div>
            </div>
            {session.gitBranch && (
              <Badge variant="outline" className="ml-3 shrink-0">{session.gitBranch}</Badge>
            )}
          </button>
        ))}
        {sessions?.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">No sessions found.</div>
        )}
      </div>
    </PageShell>
  )
}

function SessionContent({ projectPath, sessionId }: { projectPath: string; sessionId: string }) {
  const { data, isLoading, error } = useClaudeCodeSessionContent(projectPath, sessionId)
  const backTo = `/claude-code/${encodeURIComponent(projectPath)}`

  if (isLoading) {
    return <PageShell title="Session" backTo={backTo}><Loading /></PageShell>
  }

  if (error) {
    return <PageShell title="Session" backTo={backTo}><ErrorMessage error={error} /></PageShell>
  }

  return (
    <PageShell
      title={sessionId.slice(0, 8) + '...'}
      subtitle={`${data?.count} items`}
      backTo={backTo}
    >
      <div className="space-y-2">
        {data?.items.map((item, index) => (
          <JsonItem key={index} item={item} index={index} />
        ))}
      </div>
    </PageShell>
  )
}

function JsonItem({ item, index }: { item: Record<string, unknown>; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const type = typeof item.type === 'string' ? item.type : 'unknown'

  return (
    <div className="rounded-md border bg-card text-card-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
      >
        <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">{index}</span>
        <Badge variant="outline" className={cn(
          type === 'assistant' && 'border-blue-500 text-blue-500',
          type === 'user' && 'border-green-500 text-green-500',
        )}>
          {type}
        </Badge>
        <span className="text-xs text-muted-foreground truncate">
          {expanded ? 'Click to collapse' : summarize(item)}
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>
      {expanded && (
        <pre className="overflow-x-auto border-t bg-muted/30 px-4 py-3 text-xs leading-relaxed">
          {JSON.stringify(item, null, 2)}
        </pre>
      )}
    </div>
  )
}

function PageShell({
  title,
  subtitle,
  backTo,
  children,
}: {
  title: string
  subtitle?: string
  backTo?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="container mx-auto max-w-5xl py-6 px-4">
      <div className="mb-4 flex items-center gap-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr;
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return <div className="py-16 text-center text-muted-foreground">Loading...</div>
}

function ErrorMessage({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      Error: {(error as Error).message}
    </div>
  )
}

function summarize(item: Record<string, unknown>): string {
  if (item.message && typeof item.message === 'object') {
    const msg = item.message as Record<string, unknown>
    if (Array.isArray(msg.content)) {
      const types = msg.content.map((c: Record<string, unknown>) => c.type).join(', ')
      return `content: [${types}]`
    }
  }
  const keys = Object.keys(item).filter(k => k !== 'type')
  return keys.slice(0, 4).join(', ')
}
