import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '@kombuse/ui/base'
import { SessionViewer, SessionHeader } from '@kombuse/ui/components'
import {
  useClaudeCodeProjects,
  useClaudeCodeSessions,
  useClaudeCodeSessionContent,
} from '@kombuse/ui/hooks'
import { cn } from '@kombuse/ui/lib/utils'
import type { ClaudeCodeSessionEntry, ClaudeCodeValidationResult } from '@kombuse/ui/lib/api'
import type { ViewMode } from '@kombuse/ui/components'

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
  const [viewMode, setViewMode] = useState<ViewMode>('normal')
  const backTo = `/claude-code/${encodeURIComponent(projectPath)}`

  if (isLoading) {
    return <PageShell title="Session" backTo={backTo}><Loading /></PageShell>
  }

  if (error) {
    return <PageShell title="Session" backTo={backTo}><ErrorMessage error={error} /></PageShell>
  }

  const validation = data?.validation
  const items = data?.items ?? []
  const events = data?.events ?? []

  // Build a set of invalid item indices for quick lookup
  const invalidIndices = new Set(validation?.errors.map((e) => e.index))

  // Build error lookup by index
  const errorsByIndex = new Map(validation?.errors.map((e) => [e.index, e.issues]))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={() => window.history.back()}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          &larr;
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{sessionId.slice(0, 8)}...</h1>
          <span className="text-xs text-muted-foreground">{data?.count} items</span>
        </div>
        {validation && <ValidationSummary validation={validation} />}
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Raw JSON items */}
        <div className="w-2/5 overflow-y-auto border-r p-3 space-y-2">
          {items.map((item, index) => (
            <JsonItem
              key={index}
              item={item}
              index={index}
              hasError={invalidIndices.has(index)}
              errors={errorsByIndex.get(index)}
            />
          ))}
        </div>

        {/* Right panel: SessionViewer */}
        <div className="flex w-3/5 flex-col">
          <SessionHeader
            eventCount={events.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sessionId={sessionId}
          />
          <SessionViewer
            events={events}
            viewMode={viewMode}
            emptyMessage="No events to render"
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}

function ValidationSummary({ validation }: { validation: ClaudeCodeValidationResult }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs"
      >
        <Badge variant="outline" className="border-green-500 text-green-500">
          {validation.valid} valid
        </Badge>
        {validation.invalid > 0 && (
          <Badge variant="outline" className="border-red-500 text-red-500">
            {validation.invalid} invalid
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="absolute right-0 top-8 z-10 w-72 rounded-md border bg-popover p-3 shadow-md text-xs space-y-1">
          <div className="font-medium mb-2">Validation by type</div>
          {Object.entries(validation.byType).map(([type, counts]) => (
            <div key={type} className="flex justify-between">
              <span className="text-muted-foreground">{type}</span>
              <span>
                <span className="text-green-500">{counts.valid}</span>
                {counts.invalid > 0 && (
                  <span className="text-red-500 ml-2">{counts.invalid} err</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function JsonItem({
  item,
  index,
  hasError,
  errors,
}: {
  item: Record<string, unknown>
  index: number
  hasError?: boolean
  errors?: { path: string; message: string; code: string }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const type = typeof item.type === 'string' ? item.type : 'unknown'

  return (
    <div className={cn(
      'rounded-md border bg-card text-card-foreground',
      hasError && 'border-red-500/50',
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
      >
        <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">{index}</span>
        <Badge variant="outline" className={cn(
          type === 'assistant' && 'border-blue-500 text-blue-500',
          type === 'user' && 'border-green-500 text-green-500',
          hasError && 'border-red-500 text-red-500',
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
        <>
          {errors && errors.length > 0 && (
            <div className="border-t border-red-500/30 bg-red-500/5 px-4 py-2 text-xs space-y-1">
              <div className="font-medium text-red-500">Validation errors:</div>
              {errors.map((err, i) => (
                <div key={i} className="text-red-400">
                  <span className="font-mono">{err.path || '(root)'}</span>: {err.message}
                </div>
              ))}
            </div>
          )}
          <pre className="overflow-x-auto border-t bg-muted/30 px-4 py-3 text-xs leading-relaxed">
            {JSON.stringify(item, null, 2)}
          </pre>
        </>
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
