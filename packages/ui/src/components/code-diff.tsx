'use client'

import { lazy, Suspense, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Columns2, Rows2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { detectLanguage } from '../lib/language-map'

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.DiffEditor }))
)

export interface CodeDiffProps {
  original: string
  modified: string
  filePath?: string
  language?: string
  height?: string | number
  maxHeight?: number
  readOnly?: boolean
  className?: string
}

function DiffSkeleton({ height }: { height: string | number }) {
  return (
    <div
      className="flex items-center justify-center bg-muted/20 text-xs text-muted-foreground"
      style={{ height: typeof height === 'number' ? `${height}px` : height, minHeight: '80px' }}
    >
      <span className="animate-pulse">Loading diff...</span>
    </div>
  )
}

export function CodeDiff({
  original,
  modified,
  filePath,
  language,
  height: heightProp,
  maxHeight = 400,
  readOnly = true,
  className,
}: CodeDiffProps) {
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'
  const [sideBySide, setSideBySide] = useState(false)

  const detectedLanguage = useMemo(
    () => language ?? (filePath ? detectLanguage(filePath) : 'plaintext'),
    [language, filePath]
  )

  const computedHeight = useMemo(() => {
    if (heightProp !== undefined && heightProp !== 'auto') return heightProp
    const lineCount = Math.max(original.split('\n').length, modified.split('\n').length)
    const contentHeight = lineCount * 19 + 10
    return Math.min(contentHeight, maxHeight)
  }, [heightProp, original, modified, maxHeight])

  return (
    <div className={cn('overflow-hidden rounded border border-border/50', className)}>
      <div className="flex items-center justify-end border-b border-border/50 bg-muted/30 px-2 py-1">
        <button
          type="button"
          onClick={() => setSideBySide((prev) => !prev)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={sideBySide ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
          title={sideBySide ? 'Inline diff' : 'Side-by-side diff'}
        >
          {sideBySide ? (
            <>
              <Rows2 className="size-3" />
              <span>Inline</span>
            </>
          ) : (
            <>
              <Columns2 className="size-3" />
              <span>Side by side</span>
            </>
          )}
        </button>
      </div>
      <Suspense fallback={<DiffSkeleton height={computedHeight} />}>
        <DiffEditor
          key={sideBySide ? 'sbs' : 'inline'}
          height={computedHeight}
          language={detectedLanguage}
          original={original}
          modified={modified}
          theme={monacoTheme}
          options={{
            readOnly,
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            folding: false,
            contextmenu: false,
            fontSize: 12,
            lineDecorationsWidth: 0,
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            renderOverviewRuler: false,
            domReadOnly: true,
          }}
        />
      </Suspense>
    </div>
  )
}
