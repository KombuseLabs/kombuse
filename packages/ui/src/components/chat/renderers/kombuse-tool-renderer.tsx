'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SerializedAgentToolUseEvent, SerializedAgentToolResultEvent, JsonValue } from '@kombuse/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../base/collapsible'
import { formatEventTime } from './event-card'
import { getKombuseToolConfig } from './kombuse-tool-config'

interface FormattedResult {
  display: string
  parsed: unknown
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function formatTextBlock(text: string): FormattedResult {
  const parsed = tryParseJson(text)
  if (parsed != null) {
    return {
      display: JSON.stringify(parsed, null, 2),
      parsed,
    }
  }

  return {
    display: text,
    parsed: null,
  }
}

function isTextBlock(value: JsonValue): value is { type: 'text'; text: string } {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && value.type === 'text'
    && typeof value.text === 'string'
  )
}

function formatResultContent(content: string | JsonValue[]): FormattedResult {
  if (typeof content === 'string') {
    return formatTextBlock(content)
  }

  if (Array.isArray(content)) {
    const parts: string[] = []
    let parsed: unknown = null

    for (const block of content) {
      if (isTextBlock(block)) {
        const formatted = formatTextBlock(block.text)
        parts.push(formatted.display)
        if (content.length === 1 && formatted.parsed != null) {
          parsed = formatted.parsed
        }
        continue
      }

      parts.push(JSON.stringify(block, null, 2))
    }

    return {
      display: parts.join('\n'),
      parsed,
    }
  }

  return {
    display: JSON.stringify(content, null, 2),
    parsed: content,
  }
}

function extractErrorSummary(parsed: unknown, display: string): string | null {
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const error = (parsed as Record<string, unknown>).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim()
    }
  }

  const flattened = display.replace(/\s+/g, ' ').trim()
  if (!flattened) return null
  if (flattened.length <= 100) return flattened
  return `${flattened.slice(0, 99).trimEnd()}…`
}

interface JsonDetailSectionProps {
  label: 'in' | 'out'
  value: string
  isError?: boolean
  maxLines?: number
}

function JsonDetailSection({ label, value, isError = false, maxLines = 6 }: JsonDetailSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const normalized = value.length > 0 ? value : '(empty)'
  const lineCount = normalized.trimEnd().split('\n').length
  const canExpand = lineCount > maxLines

  return (
    <div>
      <div className="flex items-start gap-2">
        <span className="w-8 shrink-0 pt-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex-1">
          <pre
            className={cn(
              'overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-xs',
              !expanded && canExpand && 'line-clamp-[var(--max-lines)]',
              isError && label === 'out' && 'text-red-700 dark:text-red-300'
            )}
            style={{ '--max-lines': maxLines } as CSSProperties}
          >
            {normalized}
          </pre>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <span>{expanded ? 'Show less' : 'Show more'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export interface KombuseToolRendererProps {
  toolUse: SerializedAgentToolUseEvent
  result?: SerializedAgentToolResultEvent
}

export function KombuseToolRenderer({ toolUse, result }: KombuseToolRendererProps) {
  const [open, setOpen] = useState(false)
  const config = getKombuseToolConfig(toolUse.name)
  const timestamp = toolUse.timestamp
  const isError = result?.isError ?? false

  const inputText = useMemo(() => JSON.stringify(toolUse.input, null, 2), [toolUse.input])
  const formattedOutput = useMemo(() => {
    if (!result) return null
    return formatResultContent(result.content)
  }, [result])

  const summary = config.summarize({
    input: toolUse.input,
    output: formattedOutput?.parsed ?? formattedOutput?.display ?? null,
    hasResult: result != null,
    isError,
  })

  const errorSummary = isError
    ? extractErrorSummary(formattedOutput?.parsed ?? null, formattedOutput?.display ?? '')
    : null

  const Icon = config.icon

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn('rounded-lg text-sm', isError ? 'bg-red-500/5 ring-1 ring-red-500/20' : 'bg-muted/30')}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-xs font-medium">
              <span className="text-muted-foreground">{config.label}</span>
              {summary && <span>{` · ${summary}`}</span>}
            </span>
            {isError && (
              <span className="truncate text-[10px] text-red-600 dark:text-red-400">
                {errorSummary ?? 'Failed'}
              </span>
            )}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatEventTime(timestamp)}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border px-3 py-2">
            <JsonDetailSection label="in" value={inputText} />
            {formattedOutput && (
              <JsonDetailSection label="out" value={formattedOutput.display} isError={isError} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
