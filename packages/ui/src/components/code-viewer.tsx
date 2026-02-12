'use client'

import { lazy, Suspense, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '../lib/utils'
import { detectLanguage } from '../lib/language-map'

const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.Editor }))
)

export interface CodeViewerProps {
  value: string
  filePath?: string
  language?: string
  maxHeight?: number
  className?: string
}

function ViewerSkeleton({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center bg-muted/20 text-xs text-muted-foreground"
      style={{ height: `${height}px`, minHeight: '60px' }}
    >
      <span className="animate-pulse">Loading...</span>
    </div>
  )
}

export function CodeViewer({
  value,
  filePath,
  language,
  maxHeight = 300,
  className,
}: CodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'

  const detectedLanguage = useMemo(
    () => language ?? (filePath ? detectLanguage(filePath) : 'plaintext'),
    [language, filePath]
  )

  const computedHeight = useMemo(() => {
    const lineCount = value.split('\n').length
    const contentHeight = lineCount * 19 + 10
    return Math.min(contentHeight, maxHeight)
  }, [value, maxHeight])

  return (
    <div className={cn('overflow-hidden rounded border border-border', className)}>
      <Suspense fallback={<ViewerSkeleton height={computedHeight} />}>
        <Editor
          height={computedHeight}
          language={detectedLanguage}
          value={value}
          theme={monacoTheme}
          options={{
            readOnly: true,
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
            domReadOnly: true,
          }}
        />
      </Suspense>
    </div>
  )
}
